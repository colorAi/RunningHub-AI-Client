import React, { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import {
  safeCover,
  type CardGroup,
  type CardOrganization,
} from "../../services/cardLibrary/model";
import type { WebAppInfo } from "../../types";
import { controlClass } from "./ManagerDialog";

interface CardTileProps {
  appId: string;
  appInfo: WebAppInfo | null;
  organization: CardOrganization;
  groups: CardGroup[];
  status?: string;
  primary: string;
  onPrimary: () => void;
  children: React.ReactNode;
}
const CardTile: React.FC<CardTileProps> = ({
  appId,
  appInfo,
  organization,
  groups,
  status,
  primary,
  onPrimary,
  children,
}) => {
  const src =
    safeCover(appInfo?.covers?.[0]?.thumbnailUri) ||
    safeCover(appInfo?.covers?.[0]?.uri);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const title =
    organization.title || appInfo?.webappName || appId || "新任务卡片";
  return (
    <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-[#161920]">
      <button
        type="button"
        aria-label={`${primary}：${title}`}
        onClick={onPrimary}
        className="relative flex aspect-video w-full items-center justify-center bg-slate-100 focus-visible:outline focus-visible:outline-brand-500 dark:bg-slate-800"
      >
        {src && !broken ? (
          <img
            src={src}
            alt={title}
            loading="lazy"
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <ImageIcon
            aria-label="默认应用封面"
            className="h-12 w-12 text-slate-400"
          />
        )}
      </button>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="break-words font-semibold">{title}</h3>
          <p className="mt-1 break-all text-xs text-slate-500">
            {appInfo?.webappName || "未加载应用"} · {appId || "未填写 ID"}
          </p>
        </div>
        {status && (
          <p
            role="status"
            className="text-sm text-brand-600 dark:text-brand-300"
          >
            {status}
          </p>
        )}
        <div className="flex flex-wrap gap-1">
          {organization.groupIds.length === 0 && (
            <span className="text-xs text-slate-500">未分组</span>
          )}
          {groups
            .filter((group) => organization.groupIds.includes(group.id))
            .map((group) => (
              <span
                key={group.id}
                className="max-w-full break-all rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800"
              >
                {group.name}
              </span>
            ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {organization.tags.map((tag) => (
            <span
              key={tag}
              className="max-w-full break-all rounded-full bg-brand-100 px-2 py-1 text-xs text-brand-700 dark:bg-brand-900 dark:text-brand-100"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-auto flex flex-wrap gap-2">
          <button
            type="button"
            className={`${controlClass} !bg-brand-500 !text-white`}
            onClick={onPrimary}
          >
            {primary}
          </button>
          {children}
        </div>
      </div>
    </article>
  );
};
export default CardTile;
