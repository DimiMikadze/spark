-- Leads captured by the Qualifier and updated by the Booker. Email is the
-- natural key: a lead is identified by the address they typed in chat, and
-- the Booker looks them up by email when reschedule/cancel comes through.
CREATE TABLE IF NOT EXISTS leads (
  email                 text PRIMARY KEY,
  business_description  text NOT NULL,
  ai_need               text,
  -- Set by the Booker after createEvent succeeds; cleared (NULL) on cancel.
  -- The mock event id from tools/calendar.ts gets stored verbatim until the
  -- real Google Calendar wiring lands.
  calendar_event_id     text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
