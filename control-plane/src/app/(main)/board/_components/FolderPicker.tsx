"use client";

import { useEffect, useMemo, useState } from "react";
import type { FileNode } from "@/lib/fileUtils";

export interface FolderSelection {
  // "" is the whole site; otherwise "a/b" with no slashes at either end.
  folder: string;
  // Paths relative to the folder; a directory ends with "/".
  exclude: string[];
}

function flattenDirectories(nodes: FileNode[], into: string[] = []): string[] {
  for (const node of nodes) {
    if (!node.isDirectory) continue;
    if (node.path === ".backup" || node.path.startsWith(".backup/")) continue;
    into.push(node.path);
    flattenDirectories(node.children ?? [], into);
  }
  return into;
}

function findNode(nodes: FileNode[], path: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.isDirectory && path.startsWith(`${node.path}/`)) {
      return findNode(node.children ?? [], path);
    }
  }
  return null;
}

function countFiles(node: FileNode): number {
  if (!node.isDirectory) return 1;
  return (node.children ?? []).reduce(
    (sum, child) => sum + countFiles(child),
    0,
  );
}

// Picks one folder of the person's site and lets them leave out files or
// subfolders inside it. The server applies the same rules again.
export function FolderPicker({
  value,
  onChange,
}: {
  value: FolderSelection;
  onChange: (value: FolderSelection) => void;
}) {
  const [tree, setTree] = useState<FileNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/files/tree")
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) setTree(data.files);
        else setError(data.message ?? "파일 목록을 불러올 수 없습니다.");
      })
      .catch(() => !cancelled && setError("파일 목록을 불러올 수 없습니다."));
    return () => {
      cancelled = true;
    };
  }, []);

  const directories = useMemo(
    () => (tree ? flattenDirectories(tree) : []),
    [tree],
  );
  const children = useMemo(() => {
    if (!tree) return [];
    if (!value.folder) return tree;
    return findNode(tree, value.folder)?.children ?? [];
  }, [tree, value.folder]);

  const excluded = new Set(value.exclude);
  const prefix = value.folder ? `${value.folder}/` : "";

  function relative(node: FileNode) {
    const path = node.path.slice(prefix.length);
    return node.isDirectory ? `${path}/` : path;
  }

  function toggle(node: FileNode) {
    const path = relative(node);
    const next = new Set(excluded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onChange({ ...value, exclude: [...next] });
  }

  function renderNodes(nodes: FileNode[], depth: number): React.ReactNode {
    return nodes
      .filter(
        (node) => !(depth === 0 && !value.folder && node.path === ".backup"),
      )
      .map((node) => {
        const path = relative(node);
        const isExcluded = excluded.has(path);
        return (
          <li key={node.path}>
            <label
              className={`flex h-9 items-center gap-2 border-b border-border/60 pr-3 text-sm ${isExcluded ? "text-muted-foreground" : "text-foreground"}`}
              style={{ paddingLeft: `${0.75 + depth * 1.25}rem` }}
            >
              <input
                type="checkbox"
                checked={!isExcluded}
                onChange={() => toggle(node)}
                className="h-4 w-4 accent-primary"
              />
              <span className="truncate">
                {node.name}
                {node.isDirectory ? "/" : ""}
              </span>
              {node.isDirectory && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {isExcluded ? "제외함" : `파일 ${countFiles(node)}개`}
                </span>
              )}
            </label>
            {node.isDirectory && !isExcluded && node.children?.length ? (
              <ul>{renderNodes(node.children, depth + 1)}</ul>
            ) : null}
          </li>
        );
      });
  }

  if (error) {
    return (
      <p className="border border-destructive p-3 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!tree) {
    return (
      <p className="border border-border p-3 text-sm text-muted-foreground">
        파일 목록을 불러오는 중…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <label htmlFor="template-folder" className="text-sm font-bold">
          공유할 폴더
        </label>
        <select
          id="template-folder"
          value={value.folder}
          onChange={(event) =>
            onChange({ folder: event.target.value, exclude: [] })
          }
          className="h-11 w-full border border-border bg-background px-3 text-sm"
        >
          <option value="">/ (사이트 전체)</option>
          {directories.map((directory) => (
            <option key={directory} value={directory}>
              /{directory}/
            </option>
          ))}
        </select>
      </div>
      <div className="max-h-80 overflow-y-auto border border-border">
        {children.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">
            이 폴더에 파일이 없어요.
          </p>
        ) : (
          <ul>{renderNodes(children, 0)}</ul>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        체크를 풀면 템플릿에서 빠져요. 비공개 초안이나 개인 정보가 든 파일은 빼
        주세요. /.backup/ 폴더는 항상 빠져요.
      </p>
    </div>
  );
}
