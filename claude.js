import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const msg = await client.messages.create({
  model: "claude-3-sonnet-20240229",
  max_tokens: 200,
  messages: [{ role: "user", content: "Write a Hello World in JavaScript." }]
});

console.log(msg.content[0].text);
