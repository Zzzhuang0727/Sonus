import cors from "@fastify/cors";
import fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { env, paths } from "./config/env";
import { registerApiRoutes } from "./router/api";
import { stateStore } from "./state/store";
import { userStore } from "./users/store";

async function main() {
  await stateStore.load();
  await userStore.load();

  const app = fastify({
    logger: {
      level: "info"
    }
  });

  await app.register(cors, {
    origin: [env.SONUS_WEB_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"],
    credentials: true
  });

  await app.register(fastifyStatic, {
    root: paths.ttsCache,
    prefix: "/tts/",
    decorateReply: false
  });

  await registerApiRoutes(app);

  await app.listen({ port: env.SONUS_PORT, host: "0.0.0.0" });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
