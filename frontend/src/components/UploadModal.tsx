import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useT } from "../i18n";
import type { ImportResult } from "../types";

// Загрузка .md/.json вопросов: drag-and-drop или выбор файла. Валидные новые ноды сохраняются на бэке,
// после чего доска перезагружается (onImported). Esc/клик-по-фону закрывают (Esc — на оверлее).
export function UploadModal({ pool, onClose, onImported }: { pool: string; onClose: () => void; onImported: () => void }) {
  const t = useT();
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Esc закрывает надёжно (capture-фаза, чтобы не зависеть от прочих window-listener'ов и ре-рендеров).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    const acc: ImportResult = { added: [], errors: [] };
    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const r = await api.importFile(pool, file.name, text);
        acc.added.push(...r.added);
        acc.errors.push(...r.errors);
      } catch (e) {
        acc.errors.push({ file: file.name, error: String(e) });
      }
    }
    setResult(acc);
    setBusy(false);
    if (acc.added.length) onImported();
  };

  return (
    <div className="upload-modal" onClick={onClose}>
      <div className="upload-modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="upload-modal__head">
          <strong>{t("Загрузить вопросы")}</strong>
          <button className="upload-modal__close" onClick={onClose} title={t("Закрыть (Esc)")}>
            ✕
          </button>
        </div>

        <div
          className={`dropzone ${dragActive ? "dropzone--active" : ""}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          {busy ? t("Загрузка…") : t("Перетащите .md / .json сюда или нажмите для выбора")}
          <input
            ref={inputRef}
            type="file"
            accept=".md,.json"
            multiple
            hidden
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {result && (
          <div className="upload-result">
            {result.added.length > 0 && (
              <div className="upload-result__ok">
                {t("Добавлено: {n}", { n: result.added.length })}
                <ul>
                  {result.added.map((a) => (
                    <li key={a.path}>
                      {a.id} <span className="muted">· {a.block}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="upload-result__err">
                {t("Ошибки: {n}", { n: result.errors.length })}
                <ul>
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      <b>{e.file}</b>: {e.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
