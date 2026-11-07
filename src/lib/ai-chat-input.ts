import { z } from "zod";

/** Client conversation history is untrusted; only user turns may be submitted. */
export const ChatBodySchema = z.object({
  dataset: z.string().max(200000),
  messages: z.array(z.object({
    role: z.literal("user"),
    content: z.string().max(20000),
  })).min(1).max(40),
});

export function userChatMessages(messages: { role: "user" | "assistant"; content: string }[]) {
  return messages.filter((message) => message.role === "user");
}