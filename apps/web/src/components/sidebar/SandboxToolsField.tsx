import {
  SANDBOX_TOOL_CATALOG,
  SandboxToolModule,
  type SandboxToolModule as SandboxToolModuleValue,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";

const decodeToolJson = Schema.decodeUnknownOption(Schema.fromJsonString(SandboxToolModule));

const CATALOG_IDS = new Set(SANDBOX_TOOL_CATALOG.map((tool) => tool.id));

const CUSTOM_TOOL_EXAMPLE = `{
  "id": "my-tool",
  "name": "My tool",
  "description": "What it does",
  "category": "other",
  "install": ["npm install -g my-tool@1.0.0"],
  "mcp": { "command": "my-tool", "args": ["mcp"] }
}`;

/**
 * The template's tool modules: curated ones from the catalog behind a switch,
 * and the template's own definitions, added as JSON. A switched-on catalog
 * tool is copied into the template, so catalog updates never change it.
 */
export function SandboxToolsField({
  tools,
  onChange,
}: {
  readonly tools: ReadonlyArray<SandboxToolModuleValue>;
  readonly onChange: (tools: ReadonlyArray<SandboxToolModuleValue>) => void;
}) {
  const [customJson, setCustomJson] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const customTools = tools.filter((tool) => !CATALOG_IDS.has(tool.id));

  const addCustom = () => {
    const decoded = decodeToolJson(customJson);
    if (Option.isNone(decoded)) {
      setCustomError("Not a valid tool definition; compare with the example.");
      return;
    }
    if (tools.some((tool) => tool.id === decoded.value.id)) {
      setCustomError(`A tool with the id ${decoded.value.id} is already in this template.`);
      return;
    }
    onChange([...tools, decoded.value]);
    setCustomJson("");
    setCustomError(null);
  };

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-xs font-medium">Tools</legend>
      {SANDBOX_TOOL_CATALOG.map((catalogTool) => {
        const current = tools.find((tool) => tool.id === catalogTool.id);
        return (
          <label key={catalogTool.id} className="flex items-start gap-2 text-sm">
            <Switch
              checked={current !== undefined}
              onCheckedChange={(checked) =>
                onChange(
                  checked
                    ? [...tools, catalogTool]
                    : tools.filter((tool) => tool.id !== catalogTool.id),
                )
              }
            />
            <span className="flex min-w-0 flex-col">
              <span>
                {catalogTool.name}
                {(current ?? catalogTool).version ? (
                  <span className="text-muted-foreground text-xs">
                    {" "}
                    {(current ?? catalogTool).version}
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground text-xs">{catalogTool.description}</span>
            </span>
          </label>
        );
      })}
      {customTools.map((tool) => (
        <div key={tool.id} className="flex items-start gap-2 text-sm">
          <Button
            size="icon-xs"
            variant="ghost-muted"
            aria-label={`Remove ${tool.name}`}
            onClick={() => onChange(tools.filter((entry) => entry.id !== tool.id))}
          >
            <Trash2Icon className="size-3.5" />
          </Button>
          <span className="flex min-w-0 flex-col">
            <span>
              {tool.name}
              <span className="text-muted-foreground text-xs"> custom</span>
            </span>
            <span className="text-muted-foreground text-xs">{tool.description}</span>
          </span>
        </div>
      ))}
      <label className="flex flex-col gap-1 text-xs font-medium">
        Add your own tool (JSON)
        <Textarea
          rows={4}
          value={customJson}
          placeholder={CUSTOM_TOOL_EXAMPLE}
          onChange={(event) => {
            setCustomJson(event.target.value);
            setCustomError(null);
          }}
        />
      </label>
      {customError === null ? null : <p className="text-destructive text-xs">{customError}</p>}
      <div>
        <Button
          size="xs"
          variant="outline"
          disabled={customJson.trim().length === 0}
          onClick={addCustom}
        >
          Add tool
        </Button>
      </div>
    </fieldset>
  );
}
