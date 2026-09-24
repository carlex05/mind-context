import { useState } from "react";

export function PropertiesEditor({
  tags,
  aliases,
  knownTags,
  onTagsChange,
  onAliasesChange,
}: {
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly knownTags: readonly string[];
  readonly onTagsChange: (tags: readonly string[]) => void;
  readonly onAliasesChange: (aliases: readonly string[]) => void;
}) {
  return (
    <section className="properties-editor" aria-label="Note properties">
      <h3>Properties</h3>
      <PropertyList
        label="Tags"
        values={tags}
        placeholder="Add tag"
        suggestions={knownTags.filter((tag) => !tags.includes(tag))}
        prefix="#"
        onChange={onTagsChange}
      />
      <PropertyList
        label="Aliases"
        values={aliases}
        placeholder="Add alias"
        suggestions={[]}
        onChange={onAliasesChange}
      />
    </section>
  );
}

function PropertyList({
  label,
  values,
  placeholder,
  suggestions,
  prefix = "",
  onChange,
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly placeholder: string;
  readonly suggestions: readonly string[];
  readonly prefix?: string;
  readonly onChange: (values: readonly string[]) => void;
}) {
  const [value, setValue] = useState("");

  function add(raw: string) {
    const normalized = raw.trim().replace(prefix === "#" ? /^#/ : /$^/, "");
    if (!normalized || values.includes(normalized)) {
      setValue("");
      return;
    }
    onChange([...values, normalized]);
    setValue("");
  }

  return (
    <div className="property-editor-row">
      <span>{label}</span>
      <div className="property-editor-content">
        <div className="chip-list">
          {values.map((item) => (
            <span className={prefix ? "tag-chip editable-chip" : "property-chip editable-chip"} key={item}>
              {prefix}{item}
              <button
                type="button"
                aria-label={`Remove ${label.toLocaleLowerCase()} ${item}`}
                onClick={() => onChange(values.filter((value) => value !== item))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          aria-label={`Add ${label.toLocaleLowerCase()}`}
          value={value}
          list={suggestions.length > 0 ? `${label}-suggestions` : undefined}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(value);
            }
          }}
          onBlur={() => {
            if (value.trim()) add(value);
          }}
          placeholder={placeholder}
        />
        {suggestions.length > 0 ? (
          <datalist id={`${label}-suggestions`}>
            {suggestions.map((suggestion) => (
              <option value={suggestion} key={suggestion} />
            ))}
          </datalist>
        ) : null}
      </div>
    </div>
  );
}
