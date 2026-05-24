import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const thisFile = fileURLToPath(import.meta.url);
const serverSrc = path.dirname(path.dirname(thisFile));
const root = path.resolve(serverSrc, "../../..");

loadDotenv({ path: path.join(root, ".env") });

const BooleanEnvSchema = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return false;
    }
    if (typeof value === "boolean") {
      return value;
    }

    const normalized = value.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  });

const DeepSeekModelSchema = z
  .string()
  .optional()
  .transform((value) => {
    const normalized = (value ?? "deepseek-v4-pro").trim().toLowerCase().replace(/\s+/g, "");

    if (normalized.includes("flash")) {
      return "deepseek-v4-flash";
    }

    if (normalized === "deepseek-v4-pro" || normalized === "deepseek-v4" || normalized === "deepseekv4" || normalized.includes("v4-pro") || normalized.includes("v4pro")) {
      return "deepseek-v4-pro";
    }

    return normalized;
  })
  .pipe(z.enum(["deepseek-v4-flash", "deepseek-v4-pro"]));

const EnvSchema = z.object({
  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  DEEPSEEK_MODEL: DeepSeekModelSchema,
  DEEPSEEK_THINKING: z.enum(["enabled", "disabled"]).default("disabled"),
  DEEPSEEK_REASONING_EFFORT: z.enum(["high", "max"]).default("high"),
  FISH_API_KEY: z.string().optional(),
  FISH_BASE_URL: z.string().url().default("https://api.fish.audio"),
  FISH_VOICE_ID: z.string().optional(),
  NETEASE_BASE_URL: z.string().url().default("https://music.163.com"),
  NETEASE_COOKIE: z.string().optional(),
  ICS_URL: z.string().optional(),
  ICS_FILE: z.string().optional(),
  OPENWEATHER_API_KEY: z.string().optional(),
  OPENWEATHER_LOCATION: z.string().default("Shanghai,CN"),
  SONUS_PORT: z.coerce.number().int().positive().default(8787),
  SONUS_WEB_ORIGIN: z.string().default("http://localhost:3000"),
  SONUS_MOCK_AI: BooleanEnvSchema,
  SONUS_MOCK_MUSIC: BooleanEnvSchema,
  SONUS_MOCK_TTS: BooleanEnvSchema
});

export const env = EnvSchema.parse(process.env);

export const paths = {
  root,
  prompts: path.resolve(serverSrc, "../../../prompts"),
  user: path.resolve(serverSrc, "../../../user"),
  userDbFile: path.resolve(serverSrc, "../../../user/users.db"),
  userPreferenceDir: path.resolve(serverSrc, "../../../user/preferences"),
  ttsCache: path.resolve(serverSrc, "../../../cache/tts"),
  stateFile: path.resolve(serverSrc, "../../../state.db")
};
