Spark is the AI assistant of enumeral company that builds AI agents for Businesses. The main goal of Spark is to qualify leads and book meetings with them. Spark is built with Botpress.

# Botpress Configuration

## Table, spark_leadsTable

fields:
email -> user email (required)
business_description -> user business description (required)
ai_need -> what AI service they need if they know (optional)
conversation_id -> ID of the conversation to find easily (required)
calendar_event_id -> Required for updating or deleting Google calenders, added after event creation (optional)

Available Operations:
Create Rows
Delete Rows
Find Rows
Update Rows

## Variables

ai_need, business_description, email, conversation_id, currentDate, and hasBeenGreeted

Set by Setup node: currentDate, conversation_id
Set by Greeter node: hasBeenGreeted (User scope, persists across conversations)
Set by Qualifier node: ai_need, business_description, email

## Summary Agent

Enabled in Studio → Agents. Compresses older conversation history so long conversations don't hit token limits.

Settings:

- Max Transcript Turns: 20
- Max Summary Tokens: 500

Exposed variables:

- `{{conversation.SummaryAgent.summary}}` — rolling summary of older turns
- `{{conversation.SummaryAgent.transcript}}` — recent transcript (last 20 turns)

## Knowledge Base

File containing details about enumeral such as services, prices, etc.

## Tools

Google Calendar with exact following events:
Create Event
Delete Event
Update Event
Check Availability

Send Email (Subject, Body). Instructions file: send-email-tool-instructions.md

## Nodes

1. Setup (Standard Node), runs on every conversation start. Sets currentDate and conversation_id. If the user has already been greeted (user.hasBeenGreeted === true), transitions directly to Qualifier so returning users continue where they left off. Otherwise falls through to Greeter. Instructions file: setup-node.md
2. Greeter (Standard Node), sends the first message to new users and marks them as greeted. Transitions directly to Qualifier. Instructions file: greeter-node.md
3. Qualifier (Autonomous Node), for qualifying new leads and detecting returning users (reschedule/cancel). Has access to company knowledge base, variables, and table. Instructions file: qualifier-node-instructions.md
4. Booker (Autonomous Node), for managing bookings on Google Calendar. Has access to company knowledge base. Instructions file: booker-node-instructions.md

## Transitions

Setup → Qualifier (Expression): user.hasBeenGreeted === true
Setup → Greeter (default canvas arrow when expression above does not match)
Qualifier → Booker: qualifier-to-booker-transition-prompt.md

## Pricing

Rough per-conversation cost, assuming ~10 turns and prompt caching enabled. Add Botpress plan fee on top.

- Haiku 4.5: ~$0.03
- Sonnet 4.6: ~$0.10
- Opus 4.6: ~$0.17

At 500 conversations/month: Haiku ~$15, Sonnet ~$50, Opus ~$85.
