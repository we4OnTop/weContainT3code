import { expect, it } from "@effect/vitest";
import { Tool } from "effect/unstable/ai";

import { SandboxToolkit } from "./tools.ts";

it("gives every sandbox tool an object input schema", () => {
  // McpServer.registerToolkit decodes each input schema and dies on one
  // without `type: "object"`, which takes the whole server down at boot.
  // `parameters: Schema.Struct({})` renders as an `anyOf` and did exactly that.
  for (const tool of Object.values(SandboxToolkit.tools)) {
    const schema = Tool.getJsonSchema(tool as never) as { readonly type?: unknown };
    expect({ tool: tool.name, type: schema.type }).toEqual({ tool: tool.name, type: "object" });
  }
});
