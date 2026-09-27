# Platform capability matrix

Stream output and platform APIs are separate. A destination platform name labels an RTMP/RTMPS ingest. It does not connect an account.

| Platform | RTMP/RTMPS output | Read chat | Send chat | Moderation | OAuth account connection |
| --- | --- | --- | --- | --- | --- |
| Twitch | Yes, when an ingest URL and stream key are set | Yes. IRC over WebSocket, with reconnect | Not implemented | Not implemented | Not implemented |
| YouTube | Yes, when an ingest URL and stream key are set | Yes. Data API live chat polling, with message-id dedupe and page tokens | Not implemented | Not implemented | Not implemented |
| Kick | Configurable RTMP/RTMPS ingest only | Not implemented | Not implemented | Not implemented | Not implemented |
| Facebook | Configurable RTMP/RTMPS ingest only | Not implemented | Not implemented | Not implemented | Not implemented |
| Custom | Yes, any `rtmp://` or `rtmps://` URL | Not applicable | Not applicable | Not applicable | Not applicable |

The same facts are encoded in `shared/platforms.ts`. Update that table when an adapter actually lands.

Credentials for the Twitch and YouTube readers belong only in local `data/` or environment variables; `data/` is gitignored. Production packaging should migrate sensitive tokens to the operating-system credential vault.

## Unified chat contract

Twitch and YouTube messages normalize to `{ id, platform, username, text, timestamp }`. The UI does not depend on provider-specific message shapes. Kick and Facebook are not chat sources yet. Moderation, subscriptions, donations, raids, and other events are not implemented.
