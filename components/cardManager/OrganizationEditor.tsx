import React, { useState } from "react";
import type {
  CardGroup,
  CardOrganization,
} from "../../services/cardLibrary/model";
import { uniqueNames } from "../../services/cardLibrary/model";
import { controlClass } from "./ManagerDialog";

export default function OrganizationEditor({
  value,
  onChange,
  groups,
  suggestions,
}: {
  value: CardOrganization;
  onChange: (next: CardOrganization) => void;
  groups: CardGroup[];
  suggestions: string[];
}) {
  const [tag, setTag] = useState("");
  const add = (text: string) => {
    onChange({ ...value, tags: uniqueNames([...value.tags, text]) });
    setTag("");
  };
  return (
    <div className="space-y-4">
      <label className="block text-sm">
        卡片名称
        <input
          autoFocus
          className={`${controlClass} mt-1 w-full`}
          value={value.title}
          onChange={(event) =>
            onChange({ ...value, title: event.target.value })
          }
          placeholder="默认使用应用名称"
        />
      </label>
      <fieldset>
        <legend className="mb-2 text-sm">所属卡片组（可多选）</legend>
        <div className="flex flex-wrap gap-3">
          {groups.length === 0 && (
            <p className="text-sm text-slate-500">
              暂无分组，可在卡片管理页新建。
            </p>
          )}
          {groups.map((group) => (
            <label key={group.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.groupIds.includes(group.id)}
                onChange={(event) =>
                  onChange({
                    ...value,
                    groupIds: event.target.checked
                      ? [...value.groupIds, group.id]
                      : value.groupIds.filter((id) => id !== group.id),
                  })
                }
              />
              {group.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label className="block text-sm">
          自定义标签
          <input
            className={`${controlClass} mt-1 w-full`}
            placeholder="例如：字幕提取，按回车添加"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add(tag);
              }
            }}
          />
        </label>
        <button
          type="button"
          className={`${controlClass} mt-2`}
          disabled={!tag.trim()}
          onClick={() => add(tag)}
        >
          添加标签
        </button>
        <div className="mt-2 flex flex-wrap gap-2">
          {value.tags.map((name) => (
            <button
              type="button"
              key={name}
              aria-label={`移除标签 ${name}`}
              className="max-w-full break-all rounded-full bg-brand-100 px-3 py-1 text-sm text-brand-700 dark:bg-brand-900 dark:text-brand-100"
              onClick={() =>
                onChange({
                  ...value,
                  tags: value.tags.filter((item) => item !== name),
                })
              }
            >
              {name} ×
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {suggestions
            .filter((name) => !value.tags.includes(name))
            .map((name) => (
              <button
                type="button"
                key={name}
                className="max-w-full break-all text-sm text-slate-500 underline"
                onClick={() => add(name)}
              >
                ＋{name}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
