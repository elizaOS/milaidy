---
title: "Tutorial: Telegram Bot"
sidebarTitle: "Telegram Bot Setup"
description: "Learn how to create and configure a Telegram bot with Milady in just a few minutes"
---

# Tutorial: Telegram Bot

Get started with Milady's Telegram bot integration. This tutorial walks you through creating your first bot, configuring it, and testing it end-to-end.

<Info>
  This tutorial assumes you have Milady installed. If you haven't already, check out the [Installation Guide](../getting-started/installation.md).
</Info>

## Prerequisites

Before you begin, make sure you have:

- A Telegram account
- Milady installed on your system
- `bun` runtime (Milady uses Bun exclusively)
- A text editor for configuration files

## Step-by-Step Setup

<Steps>
  <Step title="Create a Bot with BotFather">
    Open Telegram and search for **@BotFather**, the official bot for creating Telegram bots.

    1. Start a conversation with @BotFather by clicking the "Start" button
    2. Send the command: `/newbot`
    3. BotFather will ask you to choose a name for your bot (this is display name)
    4. Choose a unique username for your bot (must end with "bot")
    5. BotFather will respond with your **bot token** - save this somewhere safe

    <Warning>
      Never share your bot token publicly or commit it to version control. It grants full access to your bot.
    </Warning>

    Your token will look something like: `123456789:ABCdefGHIjklmNOpqrsTUVwxyzABC-defGHI`
  </Step>

  <Step title="Get Your Bot Token">
    The bot token is the key to controlling your bot. From BotFather's response, copy the token carefully.

    You can retrieve your token anytime by:
    1. Messaging @BotFather with `/mybots`
    2. Selecting your bot from the list
    3. Selecting "API Token"

    Keep this token handy - you'll need it in the next step.

    <Tip>
      Store your token in an environment variable for security. You can create a `.env` file in your Milady project root.
    </Tip>
  </Step>

  <Step title="Configure milady.json">
    Create or update your `milady.json` configuration file with your Telegram bot settings.

    In your Milady project root, create a `milady.json` file (or edit the existing one):

    ```json5
    {
      // Telegram bot configuration
      telegram: {
        enabled: true,
        token: "YOUR_BOT_TOKEN_HERE",
        // Or use environment variable:
        // token: "${TELEGRAM_TOKEN}",
        
        // Optional: Webhook configuration
        webhook: {
          enabled: false,
          // url: "https://your-domain.com/telegram/webhook",
          // port: 3000
        },
        
        // Optional: Polling configuration (default)
        polling: {
          enabled: true,
          interval: 3000, // ms
          timeout: 30 // seconds
        },
        
        // Bot behavior settings
        settings: {
          commandPrefix: "/",
          autoReply: true,
          logMessages: true
        }
      },
      
      // Other Milady configuration
      name: "My Milady Bot",
      version: "1.0.0"
    }
    ```

    Replace `YOUR_BOT_TOKEN_HERE` with the token you received from BotFather.

    <Tip>
      Use environment variables for sensitive data. Set `TELEGRAM_TOKEN` in your `.env` file and reference it with `${TELEGRAM_TOKEN}`.
    </Tip>
  </Step>

  <Step title="Start Milady">
    Now you're ready to launch your bot. Use `bun` to start Milady:

    ```bash
    bun start
    ```

    Or if you have a custom start script in your `package.json`:

    ```bash
    bun run dev
    ```

    You should see output indicating that:
    - Configuration loaded successfully
    - Telegram bot connected
    - Polling (or webhook) is active
    - Bot is listening for messages

    <Info>
      Keep this terminal window open while testing. You'll see incoming messages logged here.
    </Info>
  </Step>

  <Step title="Test Your Bot">
    Time to test! Open Telegram and find your bot using the username you created.

    1. Search for your bot's username in Telegram
    2. Click "Start" or send the `/start` command
    3. Try sending a simple message like "hello"
    4. Check the terminal where Milady is running - you should see your message logged

    Send a few test messages:
    - Type `/help` to see available commands
    - Try `/ping` to test bot responsiveness
    - Send a regular message to test message handling

    <Success>
      If you see your messages in the terminal and the bot responds, you're all set!
    </Success>
  </Step>
</Steps>

## Understanding the Configuration

### Token vs. Webhook vs. Polling

**Polling** (default, recommended for testing):
- Bot regularly checks Telegram servers for new messages
- Simpler to set up, works behind most firewalls
- Slight delay between message and bot receiving it

**Webhook** (for production):
- Telegram sends messages to your server via HTTP
- Faster response times
- Requires a public URL and SSL certificate

For development, stick with polling. Switch to webhook when deploying to production.

## Troubleshooting

<AccordionGroup>
  <Accordion title="Bot token is invalid or not working">
    **Problem:** You get an error like "Unauthorized" or "Invalid bot token"
    
    **Solutions:**
    1. Double-check that you copied the entire token correctly (it's usually quite long)
    2. Verify the token hasn't been revoked by checking `/mybots` in BotFather
    3. Ensure there are no extra spaces or newlines in the token
    4. Regenerate the token in BotFather if needed (this invalidates the old one)
    5. Check that the token is correctly placed in `milady.json` or your `.env` file
  </Accordion>

  <Accordion title="Bot is not receiving messages">
    **Problem:** You send messages but the bot doesn't respond or log them
    
    **Solutions:**
    1. Check that Milady is running and the terminal shows "Bot connected"
    2. Verify you're messaging the correct bot (check the username)
    3. Increase the polling interval in config if using polling mode
    4. Check that `polling.enabled` is set to `true`
    5. Look for error messages in the terminal output
    6. Try restarting Milady with `Ctrl+C` then `bun start` again
  </Accordion>

  <Accordion title="Port already in use (webhook mode)">
    **Problem:** Error "EADDRINUSE" or "Port X already in use"
    
    **Solutions:**
    1. Change the port in `milady.json` webhook config to an available port
    2. Kill any existing processes using that port:
       - On Linux/Mac: `lsof -i :3000` (replace 3000 with your port)
       - On Windows: `netstat -ano | findstr :3000`
    3. Make sure you're not running multiple instances of Milady
    4. Check your firewall settings aren't blocking the port
  </Accordion>

  <Accordion title="Environment variables not loading">
    **Problem:** Token shows as `${TELEGRAM_TOKEN}` or undefined
    
    **Solutions:**
    1. Create or check your `.env` file in the project root
    2. Add `TELEGRAM_TOKEN=your_actual_token` to the `.env` file
    3. Restart Milady after saving the `.env` file
    4. Ensure Milady is loading `.env` (check for `dotenv` in the code)
    5. Try using the token directly in `milady.json` for testing, then use env vars in production
  </Accordion>

  <Accordion title="Bot responds slowly or hangs">
    **Problem:** Messages are delayed or the bot seems unresponsive
    
    **Solutions:**
    1. Reduce the `polling.interval` in config (lower = faster checks, default 3000ms)
    2. Reduce the `polling.timeout` value (default 30 seconds)
    3. Check your internet connection
    4. Monitor system resources - RAM or CPU might be maxed out
    5. Check Milady logs for errors or hanging processes
    6. Try webhook mode instead of polling for production deployments
  </Accordion>
</AccordionGroup>

## Next Steps

Congratulations! Your Telegram bot is now running. Here's what to explore next:

- **[Command Handling](../guides/commands.md)** - Create custom commands for your bot
- **[Message Types](../guides/message-types.md)** - Handle different message types (photos, videos, files)
- **[Deployment Guide](../guides/deployment.md)** - Deploy your bot to production
- **[API Reference](../api/telegram.md)** - Full Telegram API documentation for Milady
- **[Advanced Configuration](../guides/advanced-config.md)** - Webhooks, database integration, and more

## Need Help?

- Check the [FAQ](../help/faq.md) for common questions
- Join the [Milady Community Discord](https://discord.gg/milady)
- Report issues on [GitHub](https://github.com/milady/milady)