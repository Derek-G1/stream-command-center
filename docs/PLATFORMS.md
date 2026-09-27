# Platform capability matrix

| Platform | RTMP/RTMPS output | Read chat | Send chat | Notes |
| --- | --- | --- | --- | --- |
| Twitch | Yes, custom destination | Yes, IRC WebSocket adapter | Planned | Requires Twitch OAuth token for chat. |
| YouTube | Yes, custom destination | Yes, Data API live chat polling | Planned | Requires API key and liveChatId in current adapter. OAuth is the production target. |
| Kick | Yes when account provides ingest/key | Adapter boundary ready | Planned | Official event delivery/auth must be implemented against current Kick API requirements. |
| Facebook | Yes when account provides ingest/key | Adapter boundary ready | Planned | Graph API auth/review requirements apply. |
| Custom | Yes | No | No | Any compatible RTMP/RTMPS endpoint. |

Credentials belong only in local `data/` or environment variables; `data/` is gitignored. Production packaging should migrate sensitive tokens to the operating-system credential vault.

## Unified chat contract

All providers normalize to `{ id, platform, username, text, timestamp }`. The UI never depends on provider-specific message shapes. Moderation, subscriptions, donations, raids and other events should follow the same normalized event-bus model.
