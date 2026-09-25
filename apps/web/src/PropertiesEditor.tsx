import { useState } from "react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  return (
    <section className="properties-editor" aria-label={t("properties.aria")}>
      <h3>{t("properties.title")}</h3>
      <PropertyList
        label={t("properties.tags")}
        addLabel={t("properties.addTag")}
        values={tags}
        suggestions={knownTags.filter((tag) => !tags.includes(tag))}
        prefix="#"
        onChange={onTagsChange}
      />
      <PropertyList
        label={t("properties.aliases")}
        addLabel={t("properties.addAlias")}
        values={aliases}
        suggestions={[]}
        onChange={onAliasesChange}
      />
    </section>
  );
}

function PropertyList({
  label,
  addLabel,
  values,
  suggestions,
  prefix = "",
  onChange,
}: {
  readonly label: string;
  readonly addLabel: string;
  readonly values: readonly string[];
  readonly suggestions: readonly string[];
  readonly prefix?: string;
  readonly onChange: (values: readonly string[]) => void;
}) {
  const { t } = useTranslation();
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

  const listId = `property-${prefix ? "tags" : "aliases"}-suggestions`;

  return (
    <div className="property-editor-row">
      <span>{label}</span>
      <div className="property-editor-content">
        <div className="chip-list">
          {values.map((item) => (
            <span
              className={
                prefix
                  ? "tag-chip editable-chip"
                  : "property-chip editable-chip"
              }
              key={item}
            >
              {prefix}{item}
              <button
                type="button"
                aria-label={t("properties.removeValue", {
                  label: label.toLocaleLowerCase(),
                  value: item,
                })}
                onClick={() =>
                  onChange(values.filter((candidate) => candidate !== item))
                }
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <input
          aria-label={t("properties.addValue", {
            label: label.toLocaleLowerCase(),
          })}
          value={value}
          list={suggestions.length > 0 ? listId : undefined}
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
          placeholder={addLabel}
        />
        {suggestions.length > 0 ? (
          <datalist id={listId}>
            {suggestions.map((suggestion) => (
              <option value={suggestion} key={suggestion} />
            ))}
          </datalist>
        ) : null}
      </div>
    </div>
  );
}
