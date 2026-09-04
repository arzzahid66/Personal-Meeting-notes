import * as React from "react";
import type { OutputLanguage, ProjectCreate } from "@/api/types";
import { Field, Input, Textarea } from "./ui/input";
import { SimpleSelect } from "./ui/select";

export interface ProjectFormValue extends ProjectCreate {
  name: string;
}

export function useProjectForm(initial?: Partial<ProjectFormValue>) {
  const [value, setValue] = React.useState<ProjectFormValue>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    llm_context: initial?.llm_context ?? "",
    glossary: initial?.glossary ?? "",
    system_prompt_override: initial?.system_prompt_override ?? "",
    default_output_language: initial?.default_output_language ?? null,
  });

  const patch = React.useCallback(
    (next: Partial<ProjectFormValue>) => setValue((v) => ({ ...v, ...next })),
    [],
  );

  /** Empty strings mean "not set" to this API, so they are sent as null. */
  const payload = React.useCallback(
    (): ProjectCreate => ({
      name: value.name.trim(),
      description: value.description?.trim() || null,
      llm_context: value.llm_context?.trim() || null,
      glossary: value.glossary?.trim() || null,
      system_prompt_override: value.system_prompt_override?.trim() || null,
      default_output_language: value.default_output_language || null,
    }),
    [value],
  );

  return { value, patch, payload };
}

export function ProjectFormFields({
  value,
  patch,
  errors,
  idPrefix = "project",
}: {
  value: ProjectFormValue;
  patch: (next: Partial<ProjectFormValue>) => void;
  errors?: Record<string, string>;
  idPrefix?: string;
}) {
  const id = (suffix: string) => `${idPrefix}-${suffix}`;

  return (
    <div className="space-y-3">
      <Field label="Name" htmlFor={id("name")} error={errors?.name}>
        <Input
          id={id("name")}
          required
          maxLength={200}
          value={value.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Mobile App v2"
          dir="auto"
        />
      </Field>

      <Field label="Description" htmlFor={id("description")}>
        <Input
          id={id("description")}
          value={value.description ?? ""}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="Client project, weekly standups"
          dir="auto"
        />
      </Field>

      {/* These two are injected into the generation prompt: they are the
          highest-leverage thing a user can fill in, so they are not hidden
          behind an "advanced" disclosure. */}
      <Field
        label="Context for the model"
        htmlFor={id("context")}
        hint="Who the team is, what the stack is, how to refer to the client. Injected into every generation for this project."
      >
        <Textarea
          id={id("context")}
          value={value.llm_context ?? ""}
          onChange={(e) => patch({ llm_context: e.target.value })}
          placeholder="Team of 4. Backend is FastAPI, frontend React. Refer to the client as 'ACME'."
          dir="auto"
        />
      </Field>

      <Field
        label="Glossary"
        htmlFor={id("glossary")}
        hint="Names, acronyms and product terms. This measurably improves extraction from code-mixed Urdu and English."
      >
        <Textarea
          id={id("glossary")}
          value={value.glossary ?? ""}
          onChange={(e) => patch({ glossary: e.target.value })}
          placeholder="MN = Meeting Notes; R2 = Cloudflare object storage"
          dir="auto"
        />
      </Field>

      <Field label="Default output language" htmlFor={id("language")}>
        <SimpleSelect
          id={id("language")}
          value={value.default_output_language ?? ""}
          onChange={(v) =>
            patch({ default_output_language: (v || null) as OutputLanguage | null })
          }
          options={[
            { value: "", label: "Account default" },
            { value: "en", label: "English" },
            { value: "ur", label: "اردو — Urdu" },
          ]}
        />
      </Field>

      <Field
        label="System prompt override"
        htmlFor={id("prompt")}
        hint="Advanced. Replaces the assembled system prompt for this project."
      >
        <Textarea
          id={id("prompt")}
          className="min-h-20"
          value={value.system_prompt_override ?? ""}
          onChange={(e) => patch({ system_prompt_override: e.target.value })}
          dir="auto"
        />
      </Field>
    </div>
  );
}
