---
title: "Tutorial: Autonomous Agent"
sidebarTitle: "Autonomous Agent"
description: "Learn how to set up and configure autonomous agents for scheduled, automated task execution with comprehensive safety controls and monitoring."
---

## What is Autonomous Mode?

Autonomous mode enables agents to execute tasks automatically on a schedule without manual intervention. Instead of responding to user requests in real-time, autonomous agents run in the background at specified intervals, making decisions and taking actions based on predefined triggers and configurations.

<Info>
Autonomous agents are ideal for recurring tasks like data synchronization, scheduled reports, routine maintenance, and periodic monitoring.
</Info>

### Common Use Cases

<Steps>
  <Step title="Scheduled Data Processing">
    Automatically fetch data from external sources, process it, and store results at regular intervals.
  </Step>
  <Step title="Periodic Monitoring">
    Monitor system health, API endpoints, or application metrics on a schedule and alert when thresholds are exceeded.
  </Step>
  <Step title="Batch Operations">
    Execute batch jobs that would be inefficient to run in real-time, such as generating reports or cleaning up outdated records.
  </Step>
  <Step title="Event-Driven Automation">
    Trigger autonomous execution based on specific events or conditions detected in your systems.
  </Step>
  <Step title="Maintenance Tasks">
    Automate routine maintenance like cache invalidation, log rotation, or database optimization.
  </Step>
</Steps>

## Enabling Autonomous Mode

### Via Dashboard

Enabling autonomous mode for an agent is straightforward through the Milady dashboard:

<Steps>
  <Step title="Navigate to Agent Settings">
    Open your agent in the Milady dashboard and select the **Settings** tab.
  </Step>
  <Step title="Enable Autonomy">
    Toggle the **Enable Autonomous Execution** switch to activate autonomous mode.
  </Step>
  <Step title="Configure Trigger Type">
    Select your desired trigger type: **Interval**, **Cron**, or **Once**.
  </Step>
  <Step title="Set Trigger Parameters">
    Configure the specific parameters for your chosen trigger type (see Trigger Types section below).
  </Step>
  <Step title="Review Safety Settings">
    Adjust safety controls like max runs, rate limits, and resource monitoring as needed.
  </Step>
  <Step title="Save Configuration">
    Click **Save** to activate autonomous execution.
  </Step>
</Steps>

### Via API

You can also enable and configure autonomous mode programmatically using the Milady API:

<CodeGroup>
```bash curl
curl -X POST https://api.milady.ai/agents/autonomous-config \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_xyz123",
    "enabled": true,
    "triggerType": "interval",
    "triggerConfig": {
      "intervalSeconds": 3600,
      "timezone": "UTC"
    },
    "safetyControls": {
      "maxRunsPerDay": 24,
      "maxConcurrentRuns": 1,
      "timeoutSeconds": 300,
      "resourceLimits": {
        "maxMemoryMB": 512,
        "maxCpuPercent": 50
      }
    },
    "notificationChannels": ["email", "slack"]
  }'
```

```json JSON Response
{
  "success": true,
  "configId": "config_abc789",
  "agentId": "agent_xyz123",
  "status": "active",
  "nextExecutionTime": "2026-03-18T15:00:00Z",
  "createdAt": "2026-03-18T14:23:45Z"
}
```
</CodeGroup>

<Warning>
Always use environment variables or secure secret management for your API keys. Never hardcode credentials in your code or configuration files.
</Warning>

## Trigger Types

Autonomous agents support three trigger types to fit different scheduling needs:

### Interval Triggers

Execute the agent at fixed time intervals.

<CodeGroup>
```json5 Interval Configuration
{
  triggerType: "interval",
  triggerConfig: {
    intervalSeconds: 3600,        // Run every hour
    timezone: "UTC",
    startTime: "2026-03-18T09:00:00Z",  // Optional: when to begin scheduling
    randomizeDelay: true,         // Optional: add 0-5min random delay
    randomizeDelaySeconds: 300    // Max jitter in seconds
  }
}
```

```json5 Every 30 Minutes
{
  triggerType: "interval",
  triggerConfig: {
    intervalSeconds: 1800,
    timezone: "America/New_York"
  }
}
```
</CodeGroup>

<Info>
Interval triggers are best for tasks that should run at regular, predictable intervals regardless of the time of day.
</Info>

### Cron Triggers

Use cron expressions for more complex scheduling patterns.

<CodeGroup>
```json5 Cron Configuration
{
  triggerType: "cron",
  triggerConfig: {
    cronExpression: "0 9 * * MON-FRI",  // 9 AM every weekday
    timezone: "America/Los_Angeles",
    description: "Daily business hours task"
  }
}
```

```json5 Multiple Cron Examples
{
  // Twice daily at 6 AM and 6 PM
  cronExpression: "0 6,18 * * *",
  timezone: "UTC"
}

{
  // Every Monday at midnight
  cronExpression: "0 0 * * 1",
  timezone: "Europe/London"
}

{
  // Every 15 minutes during business hours
  cronExpression: "*/15 9-17 * * MON-FRI",
  timezone: "America/Chicago"
}
```
</CodeGroup>

<Tip>
Cron triggers respect timezone settings, so you can schedule tasks to run at specific local times across different regions.
</Tip>

### Once Triggers

Execute a single time at a specified timestamp.

<CodeGroup>
```json5 One-Time Execution
{
  triggerType: "once",
  triggerConfig: {
    executionTime: "2026-03-25T15:30:00Z",
    timezone: "UTC",
    description: "One-time maintenance task"
  }
}
```

```json5 Scheduled Batch Job
{
  triggerType: "once",
  triggerConfig: {
    executionTime: "2026-03-20T02:00:00Z",
    timezone: "America/New_York",
    description: "Nightly batch processing job"
  }
}
```
</CodeGroup>

<Warning>
Once triggers are one-time only. After execution, the agent will not run again unless reconfigured with a new trigger.
</Warning>

## Safety Controls

Milady provides comprehensive safety controls to prevent runaway autonomous agents and ensure predictable resource usage.

<Steps>
  <Step title="Max Runs Per Period">
    Set maximum execution limits per hour, day, or week to prevent excessive resource consumption.
  </Step>
  <Step title="Concurrent Run Limits">
    Restrict the number of agent instances running simultaneously to prevent system overload.
  </Step>
  <Step title="Execution Timeout">
    Define maximum execution duration for each autonomous run. Agents exceeding this will be terminated.
  </Step>
  <Step title="Resource Monitoring">
    Monitor CPU, memory, and network usage during autonomous execution.
  </Step>
  <Step title="Rate Limiting">
    Implement backoff strategies when external service rate limits are encountered.
  </Step>
  <Step title="Automatic Disabling">
    Configure automatic disable rules based on error rates or resource violations.
  </Step>
</Steps>

### Max Runs Configuration

<CodeGroup>
```json5 Daily Limit
{
  safetyControls: {
    maxRunsPerDay: 24,           // Maximum 24 executions per day
    maxConcurrentRuns: 1,        // Only 1 instance at a time
    timeoutSeconds: 300,         // 5 minute execution limit
    backoffMultiplier: 2.0,      // Exponential backoff on errors
    maxBackoffSeconds: 3600      // Cap backoff at 1 hour
  }
}
```

```json5 Resource Limits
{
  safetyControls: {
    resourceLimits: {
      maxMemoryMB: 512,         // 512 MB memory cap
      maxCpuPercent: 50,        // 50% CPU usage cap
      maxNetworkMBps: 10,       // 10 MB/s network limit
      diskUsageMB: 100          // Temporary disk usage
    }
  }
}
```
</CodeGroup>

## Monitoring via Autonomous Panel

The Autonomous Panel provides real-time visibility into your autonomous agent execution:

<Tabs>
  <Tab title="Overview">
    The overview tab displays:
    - Current execution status (running, idle, paused)
    - Last execution timestamp and result
    - Next scheduled execution time
    - Execution success rate (last 30 days)
    - Average execution duration
  </Tab>
  <Tab title="Execution History">
    View detailed logs of all autonomous executions:
    - Start and end times
    - Execution duration
    - Exit code and status
    - Agent output and logs
    - Error messages (if applicable)
    - Resource usage metrics
  </Tab>
  <Tab title="Performance Metrics">
    Monitor agent performance over time:
    - Execution time trends
    - Memory and CPU usage
    - Success/failure rates
    - Average response times
    - Resource utilization graphs
  </Tab>
  <Tab title="Alerts & Notifications">
    Configure notifications for autonomous execution events:
    - Execution failures
    - Resource limit warnings
    - Timeout incidents
    - Rate limit encounters
  </Tab>
</Tabs>

<Tip>
Set up email and Slack notifications for execution failures to catch issues quickly.
</Tip>

## Disabling Autonomy

You can disable autonomous mode at any time through the dashboard or API:

<CodeGroup>
```bash curl
curl -X POST https://api.milady.ai/agents/autonomous-config/disable \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent_xyz123",
    "reason": "Maintenance window"
  }'
```

```json JSON Response
{
  "success": true,
  "agentId": "agent_xyz123",
  "autonomyStatus": "disabled",
  "disabledAt": "2026-03-18T14:45:00Z",
  "previousNextExecution": "2026-03-18T15:00:00Z"
}
```
</CodeGroup>

### Dashboard Disabling

To disable via dashboard:

<Steps>
  <Step title="Open Agent Settings">
    Navigate to your agent and select **Settings**.
  </Step>
  <Step title="Toggle Autonomy Off">
    Switch the **Enable Autonomous Execution** toggle to off.
  </Step>
  <Step title="Confirm Disabling">
    Click **Confirm** in the dialog that appears.
  </Step>
</Steps>

<Warning>
Disabling autonomy will prevent any scheduled executions from running. The agent will return to manual (on-demand) execution mode.
</Warning>

## Troubleshooting

<AccordionGroup>
  <Accordion title="Agent runs but doesn't complete within timeout">
    Check your timeout configuration and agent execution logs. If tasks consistently exceed the timeout, increase the `timeoutSeconds` value in safety controls. Consider breaking complex tasks into smaller autonomous executions.
  </Accordion>
  
  <Accordion title="Executions failing with resource limits exceeded">
    Review resource usage in the performance metrics panel. Increase memory or CPU limits in `resourceLimits`, or optimize your agent to use fewer resources. Consider running fewer concurrent executions or at longer intervals.
  </Accordion>
  
  <Accordion title="Cron expression not executing at expected times">
    Verify your cron syntax and timezone settings. Use a cron expression validator to test your pattern. Ensure the timezone matches your intended execution region. Check that the agent's server time is synchronized correctly.
  </Accordion>
  
  <Accordion title="Agent disabled automatically but I don't know why">
    Check the Autonomous Panel alerts and execution history for error messages. Review error rate thresholds and resource violation logs. Look for API rate limiting responses from external services. Enable verbose logging to get more details on why execution failed.
  </Accordion>
  
  <Accordion title="Notification channels not receiving alerts">
    Verify notification channel credentials are correct and permissions are granted. Test sending a manual notification. Check email spam folders or Slack app notification settings. Ensure the agent has sufficient permissions to send to those channels.
  </Accordion>
</AccordionGroup>

## Next Steps

- Learn more about [configuring advanced autonomous mode options](/guides/autonomous-mode)
- Explore [trigger type details and edge cases](/guides/triggers)
- Set up [monitoring and alerting](/guides/monitoring) for your agents
- Review [safety best practices](/guides/safety-controls) for production deployments
