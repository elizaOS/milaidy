---
title: "Configuration Templates"
sidebarTitle: "Config Templates"
description: "Ready-to-use configuration templates for common Milady deployment scenarios"
---

## Overview

This guide provides 8 production-ready configuration templates for different use cases. Each template is a complete, copy-paste configuration that you can customize for your specific needs.

<Warning>
**Important**: Always replace placeholder values before deploying:
- `YOUR_API_KEY` - Replace with your actual API keys
- `your-model-name` - Replace with your chosen model
- `YOUR_DISCORD_TOKEN` - Replace with your Discord bot token
- Database connection strings and credentials
- Wallet addresses and private keys (store in environment variables!)
- URLs and domain names specific to your deployment
- Memory database paths and backup locations

Never commit real API keys or credentials to version control. Use environment variables instead.
</Warning>

## 1. Minimal Setup

The simplest configuration for getting started with a single model provider.

```json5
{
  // Minimal Milady configuration
  // Perfect for: Learning, prototyping, single-model deployments
  
  modelProvider: {
    type: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4-turbo",
    temperature: 0.7,
    maxTokens: 2000
  },

  // Basic system context
  system: {
    name: "Assistant",
    instructions: "You are a helpful AI assistant."
  },

  // Optional: basic logging
  logging: {
    level: "info",
    format: "json"
  }
}
```

**Use this template if you:**
- Are just getting started with Milady
- Want to test a single model provider
- Don't need persistence or multiple connectors
- Are prototyping a simple use case

---

## 2. Personal Assistant

A fully-featured personal assistant with memory, system instructions, and structured output.

```json5
{
  // Personal Assistant Configuration
  // Perfect for: Individual productivity, note-taking, knowledge management
  
  modelProvider: {
    type: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4-turbo",
    temperature: 0.7,
    maxTokens: 4000
  },

  system: {
    name: "Personal Assistant",
    instructions: `You are a personal AI assistant designed to help with productivity, 
    learning, and decision-making. You have access to the user's calendar, notes, 
    and previous conversations. Be concise, helpful, and proactive in offering insights.`,
    
    personality: {
      tone: "friendly and professional",
      responseStyle: "conversational but structured",
      proactiveHelp: true
    }
  },

  memory: {
    enabled: true,
    type: "sqlite",
    path: "./data/assistant_memory.db",
    maxConversations: 100,
    retentionDays: 90,
    embeddings: {
      enabled: true,
      provider: "openai",
      dimension: 1536
    }
  },

  plugins: [
    {
      name: "calendar",
      enabled: true,
      config: {
        provider: "google-calendar",
        syncInterval: "5m"
      }
    },
    {
      name: "notes",
      enabled: true,
      config: {
        path: "./data/notes",
        format: "markdown"
      }
    }
  ],

  logging: {
    level: "info",
    format: "json",
    file: "./logs/assistant.log"
  }
}
```

**Use this template if you:**
- Need persistent memory across conversations
- Want to build a personal knowledge base
- Require integration with productivity tools
- Need conversation history and recall

---

## 3. Discord Bot

Complete Discord bot configuration with event handling, commands, and permissions.

```json5
{
  // Discord Bot Configuration
  // Perfect for: Community automation, moderation, engagement
  
  modelProvider: {
    type: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-3.5-turbo",
    temperature: 0.6,
    maxTokens: 1024
  },

  system: {
    name: "Discord Assistant",
    instructions: `You are a Discord bot that helps server members with questions, 
    provides information, and facilitates discussions. Keep responses concise and 
    appropriate for Discord's chat format. Use Discord formatting when helpful.`
  },

  connectors: [
    {
      type: "discord",
      enabled: true,
      config: {
        token: process.env.DISCORD_TOKEN,
        intents: [
          "GUILDS",
          "GUILD_MESSAGES",
          "DIRECT_MESSAGES",
          "MESSAGE_CONTENT"
        ],
        prefix: "!",
        allowedRoles: ["member", "moderator", "admin"],
        rateLimit: {
          messagesPerSecond: 2,
          cooldownSeconds: 1
        }
      }
    }
  ],

  memory: {
    enabled: true,
    type: "sqlite",
    path: "./data/discord_memory.db",
    perGuild: true,
    maxMemoryPerGuild: 10000
  },

  handlers: {
    messageCreate: {
      enabled: true,
      respondToMentions: true,
      respondToReplies: true,
      includeThreads: true
    },
    commandHandler: {
      enabled: true,
      commands: [
        { name: "help", description: "Show available commands" },
        { name: "ping", description: "Check bot latency" },
        { name: "ask", description: "Ask the AI a question" }
      ]
    }
  },

  logging: {
    level: "info",
    format: "json",
    file: "./logs/discord_bot.log"
  }
}
```

**Use this template if you:**
- Want to deploy a Discord community bot
- Need message handling and command parsing
- Require per-guild memory and configuration
- Want rate limiting and permission controls

---

## 4. Telegram Bot

Telegram bot configuration with inline keyboards, message handling, and user management.

```json5
{
  // Telegram Bot Configuration
  // Perfect for: Mobile-first interactions, instant messaging, notifications
  
  modelProvider: {
    type: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-3.5-turbo",
    temperature: 0.5,
    maxTokens: 1024
  },

  system: {
    name: "Telegram Assistant",
    instructions: `You are a Telegram bot assistant. Keep responses short and mobile-friendly. 
    Use Telegram formatting (bold, italic, code blocks) appropriately. Be helpful and respectful.`
  },

  connectors: [
    {
      type: "telegram",
      enabled: true,
      config: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        webhookUrl: process.env.TELEGRAM_WEBHOOK_URL,
        polling: {
          enabled: false,
          timeout: 30
        },
        maxMessageLength: 4096,
        supportGroups: true,
        supportPrivateChats: true
      }
    }
  ],

  memory: {
    enabled: true,
    type: "sqlite",
    path: "./data/telegram_memory.db",
    perUser: true,
    maxMemoryPerUser: 5000
  },

  handlers: {
    messageHandler: {
      enabled: true,
      supportMarkdown: true,
      supportHTML: true,
      replyToMessages: true
    },
    commandHandler: {
      enabled: true,
      commands: [
        { name: "start", description: "Start the bot" },
        { name: "help", description: "Show help" },
        { name: "settings", description: "Manage settings" },
        { name: "clear", description: "Clear conversation history" }
      ]
    },
    inlineKeyboards: {
      enabled: true,
      maxButtonsPerRow: 2
    }
  },

  rateLimit: {
    messagesPerSecond: 30,
    perUserCooldown: 0
  },

  logging: {
    level: "info",
    format: "json",
    file: "./logs/telegram_bot.log"
  }
}
```

**Use this template if you:**
- Want a Telegram bot for instant messaging
- Need mobile-first interactions
- Require per-user conversation memory
- Want webhook or polling-based updates

---

## 5. Trading Bot

Advanced configuration for autonomous trading with market triggers, wallet integration, and risk management.

```json5
{
  // Trading Bot Configuration
  // Perfect for: Autonomous trading, market analysis, portfolio management
  // WARNING: Only use with real funds after extensive testing and validation
  
  modelProvider: {
    type: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4-turbo",
    temperature: 0.3,
    maxTokens: 2000
  },

  system: {
    name: "Trading Assistant",
    instructions: `You are an autonomous trading agent. Analyze market data, identify opportunities,
    and execute trades based on technical analysis and risk management rules. Always prioritize 
    safety and position size limits. Log all decisions and market data.`
  },

  autonomousMode: {
    enabled: true,
    approvalRequired: false,
    maxExecutionPerHour: 10,
    maxPositionSize: "10%",
    stopLossPercent: 5,
    takeProfitPercent: 15,
    riskPerTrade: 2
  },

  plugins: [
    {
      name: "market-data",
      enabled: true,
      config: {
        provider: "coinbase",
        apiKey: process.env.COINBASE_API_KEY,
        refreshInterval: "1m",
        symbols: ["BTC", "ETH", "SOL"]
      }
    },
    {
      name: "technical-analysis",
      enabled: true,
      config: {
        indicators: ["RSI", "MACD", "Bollinger Bands", "EMA"],
        timeframes: ["1m", "5m", "15m", "1h", "4h", "1d"]
      }
    },
    {
      name: "portfolio",
      enabled: true,
      config: {
        trackingEnabled: true,
        performanceMetrics: true,
        rebalanceInterval: "1w"
      }
    }
  ],

  wallet: {
    enabled: true,
    type: "ethereum",
    network: "mainnet",
    address: process.env.WALLET_ADDRESS,
    privateKey: process.env.WALLET_PRIVATE_KEY,
    maxAllocation: "0.5",
    gasStrategy: "adaptive",
    slippage: 0.5
  },

  triggers: [
    {
      name: "oversold-buy",
      condition: "RSI < 30 AND price > SMA(50)",
      action: "BUY",
      size: "2%",
      enabled: true
    },
    {
      name: "overbought-sell",
      condition: "RSI > 70 AND price < SMA(50)",
      action: "SELL",
      size: "50%",
      enabled: true
    }
  ],

  memory: {
    enabled: true,
    type: "postgresql",
    connectionString: process.env.DATABASE_URL,
    trackTrades: true,
    trackAnalysis: true,
    retentionDays: 365
  },

  logging: {
    level: "debug",
    format: "json",
    file: "./logs/trading_bot.log",
    tradeLog: "./logs/trades.log",
    alerting: {
      enabled: true,
      channels: ["email", "telegram"]
    }
  }
}
```

**Use this template if you:**
- Want to build an autonomous trading agent
- Need market data integration and technical analysis
- Require wallet and transaction management
- Want detailed trading history and audit logs
- Have significant experience with smart contracts and trading

---

## 6. Research Agent

Configuration for an autonomous research agent with knowledge bases, web browsing, and document analysis.

```json5
{
  // Research Agent Configuration
  // Perfect for: Information synthesis, market research, academic research, competitive analysis
  
  modelProvider: {
    type: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4-turbo",
    temperature: 0.2,
    maxTokens: 4000
  },

  system: {
    name: "Research Agent",
    instructions: `You are an autonomous research agent. Your goal is to thoroughly investigate topics,
    synthesize information from multiple sources, identify patterns, and provide comprehensive analysis.
    Always cite sources, question assumptions, and present both supporting and contradicting evidence.
    Be rigorous, skeptical, and thorough.`
  },

  autonomousMode: {
    enabled: true,
    maxSearchesPerQuery: 10,
    maxDocsToAnalyze: 50,
    researchDepth: "thorough"
  },

  plugins: [
    {
      name: "web-browser",
      enabled: true,
      config: {
        maxPagesPerSearch: 5,
        timeout: 30000,
        userAgent: "Milady-Research-Agent/1.0"
      }
    },
    {
      name: "document-analyzer",
      enabled: true,
      config: {
        supportedFormats: ["pdf", "docx", "txt", "md", "html"],
        maxFileSize: "50mb",
        extractMetadata: true
      }
    },
    {
      name: "knowledge-base",
      enabled: true,
      config: {
        type: "postgresql",
        connectionString: process.env.KNOWLEDGE_DB_URL,
        embeddingModel: "openai",
        vectorDimension: 1536,
        similarityThreshold: 0.7
      }
    },
    {
      name: "academic-search",
      enabled: true,
      config: {
        provider: "semanticscholar",
        maxResults: 20,
        focusOnPeerReviewed: true
      }
    }
  ],

  memory: {
    enabled: true,
    type: "postgresql",
    connectionString: process.env.DATABASE_URL,
    trackResearchTrails: true,
    deduplicateFindings: true,
    retentionDays: 180
  },

  outputFormats: {
    markdown: true,
    json: true,
    summaryLength: "medium",
    citationStyle: "chicago"
  },

  logging: {
    level: "info",
    format: "json",
    file: "./logs/research_agent.log",
    researchLog: "./logs/research_trails.log"
  }
}
```

**Use this template if you:**
- Want to build a research or information synthesis agent
- Need web browsing and document analysis capabilities
- Require a knowledge base with semantic search
- Want structured, well-cited research outputs
- Are doing competitive analysis, market research, or academic work

---

## 7. Privacy-First / Ollama (Fully Local)

Complete privacy configuration using Ollama for local LLM inference with no external API calls.

```json5
{
  // Privacy-First Configuration with Ollama
  // Perfect for: Privacy-sensitive applications, offline environments, no API key exposure
  
  modelProvider: {
    type: "ollama",
    baseUrl: "http://localhost:11434",
    model: "mistral",
    temperature: 0.7,
    maxTokens: 2048,
    topP: 0.9,
    topK: 40
  },

  system: {
    name: "Local Assistant",
    instructions: "You are a helpful AI assistant running locally on this machine. All data stays local."
  },

  // All components run locally - no external services
  connectors: [
    {
      type: "cli",
      enabled: true,
      config: {
        prompt: "local> "
      }
    }
  ],

  memory: {
    enabled: true,
    type: "sqlite",
    path: "./data/local_memory.db",
    encrypted: true,
    encryptionKey: process.env.ENCRYPTION_KEY,
    maxSize: "1gb",
    localOnly: true
  },

  security: {
    encryptionAtRest: true,
    encryptionInTransit: true,
    noExternalCalls: true,
    noDataCollection: true,
    privacyMode: "strict",
    clearCacheOnExit: true
  },

  embeddingProvider: {
    type: "ollama",
    model: "nomic-embed-text",
    baseUrl: "http://localhost:11434"
  },

  plugins: [
    {
      name: "local-search",
      enabled: true,
      config: {
        indexPath: "./data/search_index",
        fullTextSearch: true
      }
    },
    {
      name: "file-processing",
      enabled: true,
      config: {
        allowedPaths: ["./data/documents"],
        supportedFormats: ["txt", "md", "pdf"]
      }
    }
  ],

  logging: {
    level: "info",
    format: "json",
    file: "./logs/local_assistant.log",
    logToConsole: false,
    encryptLogs: true
  },

  resourceLimits: {
    maxMemoryMb: 4096,
    maxCpuPercent: 80,
    gpuAcceleration: true
  }
}
```

**Use this template if you:**
- Need maximum privacy and data protection
- Want zero external API calls or cloud dependencies
- Are running in isolated/offline environments
- Have sensitive data that can't leave your infrastructure
- Want complete control over the model

---

## 8. Production Server

Enterprise-grade configuration with PostgreSQL, monitoring, multiple connectors, and high availability.

```json5
{
  // Production Server Configuration
  // Perfect for: Enterprise deployments, multi-tenant systems, high-traffic services
  
  modelProvider: {
    type: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4-turbo",
    temperature: 0.7,
    maxTokens: 2000,
    retryPolicy: {
      maxRetries: 3,
      backoffMultiplier: 2,
      initialDelayMs: 1000
    }
  },

  system: {
    name: "Production Assistant",
    instructions: "You are a production AI system supporting multiple users and services."
  },

  database: {
    type: "postgresql",
    connectionString: process.env.DATABASE_URL,
    pool: {
      min: 10,
      max: 100,
      idleTimeoutMs: 30000
    },
    ssl: true,
    replication: {
      enabled: true,
      replicas: 2
    }
  },

  cache: {
    type: "redis",
    connectionString: process.env.REDIS_URL,
    ttl: 3600,
    maxSize: "1gb"
  },

  connectors: [
    {
      type: "http",
      enabled: true,
      config: {
        port: 3000,
        host: "0.0.0.0",
        basePath: "/api/v1",
        timeout: 30000,
        maxRequestSize: "10mb"
      }
    },
    {
      type: "discord",
      enabled: true,
      config: {
        token: process.env.DISCORD_TOKEN,
        intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"]
      }
    },
    {
      type: "telegram",
      enabled: true,
      config: {
        botToken: process.env.TELEGRAM_BOT_TOKEN,
        polling: { enabled: false }
      }
    },
    {
      type: "slack",
      enabled: true,
      config: {
        token: process.env.SLACK_TOKEN,
        signingSecret: process.env.SLACK_SIGNING_SECRET
      }
    }
  ],

  memory: {
    enabled: true,
    type: "postgresql",
    connectionString: process.env.DATABASE_URL,
    maxConversations: 1000000,
    archiveAfterDays: 180,
    embeddings: {
      enabled: true,
      provider: "openai",
      dimension: 1536,
      batchSize: 100
    }
  },

  monitoring: {
    enabled: true,
    prometheus: {
      enabled: true,
      port: 9090,
      metricsPath: "/metrics"
    },
    datadog: {
      enabled: true,
      apiKey: process.env.DATADOG_API_KEY,
      trackPerformance: true,
      trackErrors: true
    },
    errorTracking: {
      enabled: true,
      provider: "sentry",
      dsn: process.env.SENTRY_DSN,
      sampleRate: 0.1
    }
  },

  security: {
    authentication: {
      enabled: true,
      type: "jwt",
      secret: process.env.JWT_SECRET,
      expiresIn: "24h"
    },
    rateLimiting: {
      enabled: true,
      requestsPerMinute: 600,
      perUserLimit: 100
    },
    encryption: {
      atRest: true,
      inTransit: true,
      tlsCert: process.env.TLS_CERT,
      tlsKey: process.env.TLS_KEY
    },
    cors: {
      enabled: true,
      allowedOrigins: process.env.ALLOWED_ORIGINS.split(",")
    }
  },

  scaling: {
    autoscaling: {
      enabled: true,
      minInstances: 2,
      maxInstances: 20,
      targetCpuPercent: 70
    },
    loadBalancing: {
      enabled: true,
      strategy: "round-robin",
      healthCheckInterval: 10000
    }
  },

  backup: {
    enabled: true,
    type: "daily",
    destination: process.env.BACKUP_BUCKET,
    retention: 30,
    encryption: true
  },

  logging: {
    level: "info",
    format: "json",
    file: "./logs/production.log",
    maxFileSize: "100mb",
    maxFiles: 10,
    cloudLogging: {
      enabled: true,
      provider: "datadog",
      apiKey: process.env.DATADOG_API_KEY
    }
  }
}
```

**Use this template if you:**
- Are deploying to production with high availability requirements
- Need multi-connector support (Discord, Telegram, Slack, HTTP)
- Require database replication and backups
- Need monitoring, error tracking, and performance metrics
- Want enterprise-grade security and scaling
- Are managing multiple concurrent users/requests

---

## Customizing Templates

### Common Customization Points

All templates expose these key areas for customization:

**Model Provider**
```json5
modelProvider: {
  type: "openai" | "anthropic" | "ollama" | "cohere" | "mistral",
  model: "model-name",
  temperature: 0.1, // 0 = deterministic, 1 = creative
  maxTokens: 2000   // Adjust based on needs
}
```

**System Prompt**
Replace the `instructions` string with custom behavior:
```json5
system: {
  instructions: "Your custom instructions here"
}
```

**Connectors**
Add or remove connectors (discord, telegram, http, etc.) in the `connectors` array.

**Memory**
Switch between `sqlite` (local), `postgresql` (persistent), or `none` (stateless).

**Plugins**
Add functionality with plugins like web-browser, document-analyzer, market-data, etc.

### Environment Variables

Always use environment variables for sensitive values:

```bash
# .env file
OPENAI_API_KEY=sk-...
DISCORD_TOKEN=MTA...
TELEGRAM_BOT_TOKEN=123456:ABC...
DATABASE_URL=postgresql://user:pass@host/db
WALLET_PRIVATE_KEY=0x...
```

Load with:
```json5
modelProvider: {
  apiKey: process.env.OPENAI_API_KEY
}
```

---

## Validation & Testing

### Validate Configuration Syntax

Use Bun to validate your config file:

```bash
# Check if config is valid YAML/JSON5
bun run --eval "console.log(require('./config.json5'))"

# Or use the Milady config validator
bun run validate-config config.json5
```

### Test Configuration Locally

Test your configuration before deploying:

```bash
# Start Milady with your config in test mode
bun run milady --config ./config.json5 --test

# Test a specific connector
bun run milady --config ./config.json5 --test-connector discord

# Validate all API keys are accessible
bun run milady --config ./config.json5 --check-keys
```

### Dry Run Before Production

Perform a dry run to catch errors early:

```bash
# Load config and simulate initialization without running
bun run milady --config ./config.json5 --dry-run

# Test with sample input
bun run milady --config ./config.json5 --test-input "Hello, assistant"
```

### Full Integration Test

Run a complete test before production deployment:

```bash
# Initialize database, load config, and test all systems
bun run test:integration --config ./config.json5

# Run with detailed logging
bun run milady --config ./config.json5 --log-level debug
```

### Monitor During Startup

Watch logs as the system starts:

```bash
# Follow logs in real-time
bun run milady --config ./config.json5 | grep -i "error\|warning\|initialized"

# Save startup logs for debugging
bun run milady --config ./config.json5 > startup.log 2>&1
```

---

## Next Steps

1. **Choose a template** that matches your use case
2. **Copy the template** and save it as `config.json5`
3. **Replace all placeholder values** with your actual configuration
4. **Run validation** with `bun run validate-config config.json5`
5. **Test locally** before deploying to production
6. **Deploy** using your hosting platform's deployment process

See the [Configuration Reference](/docs/reference/config-reference) for complete option documentation.
