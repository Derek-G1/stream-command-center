import type { ChatConfig, ChatMessage, Platform } from '../shared/types';

type Publish = (message: ChatMessage) => void;

interface YouTubeResponse {
  items?: Array<{
    id?: string;
    authorDetails?: { displayName?: string };
    snippet?: { displayMessage?: string; publishedAt?: string };
  }>;
  nextPageToken?: string;
  pollingIntervalMillis?: number;
  error?: { message?: string };
}

export class ChatHub {
  private messages: ChatMessage[] = [];
  private twitch: WebSocket | null = null;
  private twitchRetry: NodeJS.Timeout | null = null;
  private youtubeTimer: NodeJS.Timeout | null = null;
  private generation = 0;
  private youtubeSeen = new Set<string>();

  constructor(private publish: Publish) {}

  list() { return this.messages; }

  apply(config: ChatConfig) {
    this.stopConnections();
    const generation = ++this.generation;
    this.youtubeSeen.clear();
    if (config.twitch?.enabled && config.twitch.nick && config.twitch.channel && config.twitch.oauthToken) {
      this.startTwitch(config.twitch, generation);
    }
    if (config.youtube?.enabled && config.youtube.apiKey && config.youtube.liveChatId) {
      this.startYoutube(config.youtube, generation);
    }
  }

  stop() {
    ++this.generation;
    this.stopConnections();
  }

  private stopConnections() {
    if (this.twitchRetry) clearTimeout(this.twitchRetry);
    this.twitchRetry = null;
    const twitch = this.twitch;
    this.twitch = null;
    twitch?.close();
    if (this.youtubeTimer) clearTimeout(this.youtubeTimer);
    this.youtubeTimer = null;
  }

  private add(platform: Platform, username: string, text: string, externalId?: string, timestamp?: number) {
    const clean = text.trim();
    if (!clean) return;
    const message: ChatMessage = {
      id: externalId || `${platform}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      platform,
      username: username.trim() || platform,
      text: clean,
      timestamp: timestamp ?? Date.now(),
    };
    this.messages.push(message);
    if (this.messages.length > 300) this.messages.splice(0, this.messages.length - 300);
    this.publish(message);
  }

  private startTwitch(cfg: NonNullable<ChatConfig['twitch']>, generation: number) {
    if (generation !== this.generation) return;
    try {
      const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
      this.twitch = ws;
      ws.onopen = () => {
        if (generation !== this.generation || this.twitch !== ws) return ws.close();
        ws.send(`PASS oauth:${cfg.oauthToken.replace(/^oauth:/, '')}`);
        ws.send(`NICK ${cfg.nick}`);
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        ws.send(`JOIN #${cfg.channel.replace(/^#/, '')}`);
      };
      ws.onmessage = (event) => {
        const raw = String(event.data);
        for (const line of raw.split('\r\n')) {
          if (line.startsWith('PING')) {
            ws.send('PONG :tmi.twitch.tv');
            continue;
          }
          const match = /:(\w+)!.* PRIVMSG #[^ ]+ :(.*)$/.exec(line);
          if (match) this.add('twitch', match[1]!, match[2]!);
        }
      };
      ws.onclose = () => {
        if (this.twitch === ws) this.twitch = null;
        if (generation !== this.generation) return;
        this.twitchRetry = setTimeout(() => this.startTwitch(cfg, generation), 5000);
        this.twitchRetry.unref();
      };
      ws.onerror = () => ws.close();
    } catch {
      if (generation !== this.generation) return;
      this.twitchRetry = setTimeout(() => this.startTwitch(cfg, generation), 10000);
      this.twitchRetry.unref();
    }
  }

  private startYoutube(cfg: NonNullable<ChatConfig['youtube']>, generation: number) {
    let pageToken = '';
    let firstPage = true;
    const poll = async () => {
      if (generation !== this.generation) return;
      let delay = 5000;
      try {
        const url = new URL('https://www.googleapis.com/youtube/v3/liveChat/messages');
        url.searchParams.set('part', 'snippet,authorDetails');
        url.searchParams.set('liveChatId', cfg.liveChatId);
        url.searchParams.set('key', cfg.apiKey);
        url.searchParams.set('maxResults', '200');
        if (pageToken) url.searchParams.set('pageToken', pageToken);

        const response = await fetch(url);
        const data = await response.json() as YouTubeResponse;
        if (!response.ok) throw new Error(data.error?.message || `YouTube chat HTTP ${response.status}`);

        // The first response often contains chat history. Keep it available, but never replay
        // the same message on subsequent polls.
        for (const item of data.items ?? []) {
          const id = item.id;
          if (!id || this.youtubeSeen.has(id)) continue;
          this.youtubeSeen.add(id);
          const published = item.snippet?.publishedAt ? Date.parse(item.snippet.publishedAt) : NaN;
          this.add(
            'youtube',
            item.authorDetails?.displayName ?? 'YouTube',
            item.snippet?.displayMessage ?? '',
            `youtube-${id}`,
            Number.isFinite(published) ? published : undefined,
          );
        }
        if (this.youtubeSeen.size > 2000) {
          this.youtubeSeen = new Set([...this.youtubeSeen].slice(-1000));
        }
        pageToken = data.nextPageToken ?? pageToken;
        firstPage = false;
        delay = Math.max(2000, data.pollingIntervalMillis ?? 5000);
      } catch {
        delay = firstPage ? 5000 : 10000;
      }
      if (generation !== this.generation) return;
      this.youtubeTimer = setTimeout(poll, delay);
      this.youtubeTimer.unref();
    };
    void poll();
  }
}
