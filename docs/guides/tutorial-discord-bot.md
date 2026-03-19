---
title: "Tutorial: Discord Bot"
sidebarTitle: "Discord Bot Setup"
description: "Set up Milady as a Discord bot with step-by-step instructions for creating the app, configuring permissions, and deploying your AI assistant."
---

# Setting Up Milady as a Discord Bot

This tutorial walks you through creating and configuring Milady to run as a Discord bot. By the end, you'll have a fully functional AI assistant responding to messages in your Discord server.

<Info>
Milady uses the Discord plugin to interact with Discord servers. This guide assumes you have Milady installed locally and basic familiarity with Discord's developer portal.
</Info>

## Prerequisites

Before starting, ensure you have:
- A Discord account with a server where you have admin permissions
- Milady installed on your system (see [Getting Started](/getting-started))
- Node.js 18+ installed
- A code editor for modifying configuration files

## Step-by-Step Setup

<Steps>

<Step title="Create a Discord Application">
1. Navigate to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** in the top right
3. Enter a name for your bot (e.g., "Milady AI Assistant")
4. Click **Create**
5. Go to the **Bot** tab on the left sidebar
6. Click **Add Bot**

<Tip>
You can customize your bot's avatar and username on the Bot page. Changes take effect immediately.
</Tip>

</Step>

<Step title="Get Your Bot Token">
1. In the **Bot** section, locate the **TOKEN** field
2. Click **Copy** to copy your bot token to your clipboard
3. Store this token securely—never share it publicly or commit it to version control

<Warning>
If your token is ever exposed, regenerate it immediately by clicking **Regenerate** in the Discord Developer Portal.
</Warning>

</Step>

<Step title="Configure milady.json">
1. Open your Milady installation directory and locate or create `milady.json` in the root folder
2. Add the Discord plugin configuration:

```json5
{
  // ... existing config ...
  "plugins": {
    "discord": {
      "enabled": true,
      "token": "YOUR_BOT_TOKEN_HERE",
      "intents": ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES", "MESSAGE_CONTENT"],
      "prefix": "!"
    }
  }
}
```

3. Replace `YOUR_BOT_TOKEN_HERE` with the token you copied in Step 2
4. Save the file

<Info>
The `intents` field tells Discord which events your bot should receive. `MESSAGE_CONTENT` is required to read message text.
</Info>

</Step>

<Step title="Enable the Discord Plugin">
1. Open your terminal and navigate to your Milady installation directory
2. Run the following command to verify the plugin is recognized:

```bash
bun run milady --plugins
```

3. Confirm that `discord` appears in the list of available plugins
4. Check `milady.json` to ensure `"enabled": true` is set for the Discord plugin

</Step>

<Step title="Set Permissions and Invite Your Bot">
1. In the Discord Developer Portal, go to the **OAuth2** tab
2. Select **URL Generator** from the left sidebar
3. Under **Scopes**, check:
   - `bot`
4. Under **Permissions**, check:
   - `Send Messages`
   - `Read Messages/View Channels`
   - `Read Message History`
   - `Use Slash Commands` (if using slash commands)

5. Copy the generated URL from the bottom
6. Open the URL in your browser to invite the bot to your server
7. Select your server from the dropdown and click **Authorize**

<Tip>
For a production bot, you may want to add additional permissions like `Manage Messages` or `Embed Links`. Only grant permissions your bot actually needs.
</Tip>

</Step>

<Step title="Start Milady and Test Your Bot">
1. In your terminal, start Milady:

```bash
bun run milady
```

2. You should see output confirming the Discord plugin has connected
3. In your Discord server, send a message to your bot:
   - Direct message: `Hello bot`
   - In a channel: `!hello bot` (using the prefix)

4. Your bot should respond with an AI-generated message
5. Test a few more interactions to confirm everything is working

</Step>

</Steps>

## Verification Checklist

Before considering your setup complete:

- [ ] Bot token is securely stored in `milady.json`
- [ ] Discord plugin shows as `"enabled": true`
- [ ] Bot appears online in your Discord server
- [ ] Bot responds to direct messages
- [ ] Bot responds to channel messages (if configured)
- [ ] No errors in the Milady console output

## Troubleshooting

<AccordionGroup>

<Accordion title="Bot appears offline in Discord">
This usually means the Discord plugin didn't connect successfully.

**Solutions:**
1. Verify your bot token is correct and hasn't expired
2. Check that `"enabled": true` is set in `milady.json`
3. Ensure all required intents are included in the config
4. Run `bun run milady` and look for error messages in the console
5. Regenerate your bot token if it's been more than 30 days since creation
</Accordion>

<Accordion title="Bot doesn't respond to messages">
If your bot is online but not responding:

**Solutions:**
1. Check that `MESSAGE_CONTENT` intent is enabled in both `milady.json` and the Discord Developer Portal
2. Verify the bot has permission to see and send messages in the channel
3. Check the Milady console for error messages (run with `bun run milady --verbose`)
4. Ensure your Discord server is listed in your milady.json allowed servers (if applicable)
5. Try restarting Milady with `Ctrl+C` followed by `bun run milady`
</Accordion>

<Accordion title="Permission denied errors">
Your bot is responding but encountering permission issues:

**Solutions:**
1. Go to your Discord server settings → Roles
2. Move the "Milady" role higher in the hierarchy (above other roles it needs to interact with)
3. In the Developer Portal, add missing permissions under the URL Generator
4. Re-invite your bot using the new authorization URL
5. Restart Milady after making permission changes
</Accordion>

<Accordion title="Rate limiting warnings">
Discord limits how many messages bots can send:

**Solutions:**
1. Reduce the frequency of bot responses if testing rapidly
2. Implement longer delays between test messages
3. Add rate limiting configuration to `milady.json` if available in your version
4. Avoid @mentioning the bot excessively
5. Check the Milady documentation for rate limiting best practices
</Accordion>

<Accordion title="Slash commands not showing up">
If you've configured slash commands but they're not appearing:

**Solutions:**
1. Verify `"USE_SLASH_COMMANDS": true` is set in your plugin config
2. Ensure the `use_slash_commands` permission is included in the OAuth2 URL
3. Restart Milady after enabling slash commands
4. In Discord, type `/` in a message box and wait 1-2 seconds for commands to appear
5. If still missing, re-invite the bot using your updated authorization URL
</Accordion>

</AccordionGroup>

## Next Steps

Now that your Discord bot is running, explore these guides:

- **[Telegram Bot Setup](/guides/tutorial-telegram-bot)** - Add Milady to Telegram
- **[Autonomous Agents](/guides/tutorial-autonomous-agent)** - Create self-managing AI agents
- **[Discord Connector Reference](/connectors/discord)** - Advanced Discord plugin configuration

## Additional Resources

<Tabs>
<Tab title="Discord Developer Portal">
Visit the [Discord Developer Portal](https://discord.com/developers/applications) to manage your bot's settings, permissions, and webhooks.
</Tab>
<Tab title="Milady Configuration">
See the [Configuration Guide](/configuration) for detailed options in `milady.json`.
</Tab>
<Tab title="elizaOS Documentation">
Learn more about elizaOS at the [elizaOS GitHub](https://github.com/ai16z/eliza).
</Tab>
</Tabs>

## Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review Milady's console output for error messages
3. Visit the [Milady Community Discord](https://discord.gg/milady)
4. Open an issue on the [Milady GitHub repository](https://github.com/milady/milady)
