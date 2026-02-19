---
title: Twitter/X Connector
sidebarTitle: Twitter/X
description: Connect your Milaidy agent to Twitter/X for posting tweets, replying to mentions, engaging with timelines, and monitoring keywords.
---

Connect your Milaidy agent to Twitter/X for autonomous social media engagement.

## Overview

The Twitter connector enables your agent to post tweets, reply to mentions, engage with timelines, and monitor keywords or hashtags. It uses the Twitter API v2 with OAuth 2.0 authentication.

## Prerequisites

- A Twitter Developer account with API access
- OAuth 2.0 credentials (Client ID and Client Secret)
- Elevated access for tweet posting

## Configuration

Add to your `.env` file:

```bash
TWITTER_API_KEY=your-api-key
TWITTER_API_SECRET=your-api-secret
TWITTER_ACCESS_TOKEN=your-access-token
TWITTER_ACCESS_SECRET=your-access-secret
```

Or configure in your character file:

```json
{
  "connectors": {
    "twitter": {
      "enabled": true,
      "username": "your_bot_handle",
      "mode": "reply-only",
      "monitorKeywords": ["keyword1", "keyword2"],
      "postInterval": 3600000
    }
  }
}
```

## Modes

### Reply-Only Mode

The agent only responds to mentions and replies. Safest for getting started:

```json
{ "mode": "reply-only" }
```

### Timeline Mode

The agent monitors its home timeline and engages with relevant tweets:

```json
{ "mode": "timeline" }
```

### Autonomous Mode

The agent proactively posts tweets and engages with the community based on its character and knowledge:

```json
{ "mode": "autonomous" }
```

## Features

### Mentions & Replies

The agent monitors mentions in real-time and generates contextual replies. Each mention starts or continues a conversation thread.

### Tweet Posting

In autonomous or timeline mode, the agent can compose and post original tweets based on:
- Scheduled intervals
- Knowledge base updates
- Trigger events
- Character-driven topics

### Keyword Monitoring

Track specific keywords, hashtags, or accounts:

```json
{
  "connectors": {
    "twitter": {
      "monitorKeywords": ["#AI", "#crypto", "milaidy"],
      "monitorAccounts": ["@elonmusk", "@vaboratory"]
    }
  }
}
```

### Quote Tweets & Retweets

The agent can quote tweet and retweet based on relevance scoring against its character profile and knowledge base.

### Thread Composition

For longer responses, the agent automatically breaks content into threaded tweets while maintaining coherence.

## Rate Limits

Twitter API v2 rate limits:

| Endpoint | Limit |
|----------|-------|
| Post tweet | 200/15min (app), 50/15min (user) |
| Search | 450/15min |
| Mentions | 450/15min |
| Timeline | 1500/15min |

The connector respects these limits automatically with exponential backoff.

## Content Safety

Built-in safeguards prevent:
- Duplicate or near-duplicate posts
- Excessive posting frequency
- Engagement with flagged content
- Character-breaking responses

Configure safety thresholds:

```json
{
  "connectors": {
    "twitter": {
      "minPostInterval": 1800000,
      "maxDailyPosts": 48,
      "contentFilter": true
    }
  }
}
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 403 Forbidden | Check API access level (Elevated required for posting) |
| Mentions not detected | Verify stream connection and credentials |
| Posts rejected | Check content safety filters and rate limits |
| Duplicate detection false positives | Adjust similarity threshold |

## Related

- [Autonomous Mode](/guides/autonomous-mode) — Configure autonomous behavior
- [Triggers](/guides/triggers) — Set up event-driven posting
- [Connectors Overview](/guides/connectors) — General connector architecture
