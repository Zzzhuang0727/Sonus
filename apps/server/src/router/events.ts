import type { FastifyReply } from "fastify";
import type { StreamEvent } from "@sonus/shared";

const clients = new Set<FastifyReply>();

export function addStreamClient(reply: FastifyReply) {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  });
  reply.raw.write("retry: 1000\n\n");
  clients.add(reply);

  reply.raw.on("close", () => {
    clients.delete(reply);
  });
}

export function publishEvent(event: StreamEvent) {
  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
  for (const client of clients) {
    client.raw.write(payload);
  }
}
