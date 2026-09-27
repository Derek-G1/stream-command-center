import type { ChatConfig, ChatMessage, Platform } from '../shared/types';

type Publish = (message: ChatMessage) => void;

export class ChatHub {
  private messages: ChatMessage[] = [];
  private twitch: WebSocket | null = null;
  private youtubeTimer: NodeJS.Timeout | null = null;
  constructor(private publish: Publish) {}
  list() { return this.messages; }
  apply(config: ChatConfig) { this.stop(); if (config.twitch?.enabled) this.startTwitch(config.twitch); if (config.youtube?.enabled) this.startYoutube(config.youtube); }
  stop() { this.twitch?.close(); this.twitch = null; if (this.youtubeTimer) clearTimeout(this.youtubeTimer); this.youtubeTimer = null; }
  private add(platform: Platform, username: string, text: string) {
    const message: ChatMessage = { id: `${platform}-${Date.now()}-${Math.random().toString(36).slice(2)}`, platform, username, text, timestamp: Date.now() };
    this.messages.push(message); if (this.messages.length > 300) this.messages.splice(0, this.messages.length - 300); this.publish(message);
  }
  private startTwitch(cfg: NonNullable<ChatConfig['twitch']>) {
    try {
      const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443'); this.twitch = ws;
      ws.onopen = () => { ws.send(`PASS oauth:${cfg.oauthToken.replace(/^oauth:/,'')}`); ws.send(`NICK ${cfg.nick}`); ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands'); ws.send(`JOIN #${cfg.channel.replace(/^#/,'')}`); };
      ws.onmessage = (e) => {
        const raw = String(e.data); if (raw.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); return; }
        for (const line of raw.split('\r\n')) { const m = /:(\w+)!.* PRIVMSG #[^ ]+ :(.*)$/.exec(line); if (m) this.add('twitch', m[1]!, m[2]!); }
      };
    } catch {}
  }
  private startYoutube(cfg: NonNullable<ChatConfig['youtube']>) {
    const poll = async () => {
      try {
        const url = new URL('https://www.googleapis.com/youtube/v3/liveChat/messages'); url.searchParams.set('part','snippet,authorDetails'); url.searchParams.set('liveChatId',cfg.liveChatId); url.searchParams.set('key',cfg.apiKey); url.searchParams.set('maxResults','200');
        const data = await fetch(url).then(r => r.json()) as any;
        for (const item of data.items ?? []) this.add('youtube', item.authorDetails?.displayName ?? 'YouTube', item.snippet?.displayMessage ?? '');
        this.youtubeTimer = setTimeout(poll, Math.max(2000, data.pollingIntervalMillis ?? 5000));
      } catch { this.youtubeTimer = setTimeout(poll, 10000); }
    }; void poll();
  }
}
