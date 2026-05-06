# Setup Node

Runs on every conversation start. Sets per-conversation variables and routes returning users directly to Qualifier so they continue where they left off instead of being greeted again.

## Execute Code

```js
workflow.currentDate = new Date().toISOString().split('T')[0];

workflow.conversation_id = event.conversationId;
```

## Expression Transition

Condition: `user.hasBeenGreeted === true`
Destination: Qualifier

If the condition does not match, the node falls through the default canvas arrow to the Greeter node.
