# Telegram CI notify action

This action sends Telegram message with build status using your bot to specified chat.  
**Does not send any notify if build stage was skipped or canceled by default, but you cat tune it with `skip-is-fail` and `cancel-is-fail`**

## Inputs

### `status`

**Required** `outcome` property of monitored step

### `bot-token`

**Required** Your Telegram bot token

### `chat-id`

**Required** Chat ID to send notification to

### `container-name`

**Required** Name of your container or app

### `container-link`

**Required** Link to container page or app

### `message-tag`

Hashtag in message

### `fail-on-status`

Whether to fail if previous step has failed

### `skip-is-fail`

Do threat skip as fail

### `cancel-is-fail`

Do threat cancel as fail

## Example usage

```yaml
name: Send notify to Telegam
uses: KaMeHb-UA/telegram-ci-notify-action@v3
if: ${{ always() }}
with:
  status: ${{ steps.<your_build_step_id>.outcome }}
  bot-token: ${{ secrets.TG_BOT_TOKEN }}
  chat-id: ${{ secrets.TG_LOG_CHAT }}
  container-name: my-org/container-name
  container-link: https://my-docker-registry.com/my-org/container-name
```
