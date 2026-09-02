import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { AddQuestionModal } from "../components/AddQuestionModal";
import { BankBrowser } from "../components/BankBrowser";
import { UploadModal } from "../components/UploadModal";
import { downloadBank } from "../report";
import type { PoolConfig, QNode } from "../types";
import { PageShell } from "./PageShell";

// Банк вопросов направления как страница: просмотр (BankBrowser embedded) + правки контента.
export function BankPage({ pool, onChanged }: { pool: PoolConfig; onChanged: () => void }) {
  const [nodes, setNodes] = useState<QNode[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(
    () => api.graph(pool.id).then((g) => setNodes(g.nodes)).catch(() => setNodes([])),
    [pool.id],
  );
  useEffect(() => { load(); }, [load]);
  const changed = () => { load(); onChanged(); };

  return (
    <PageShell
      title={`Банк вопросов · ${pool.label}`}
      actions={
        <>
          <button className="iconbtn addbtn" onClick={() => setAddOpen(true)}>Добавить вопрос</button>
          <button className="iconbtn uploadbtn" onClick={() => setUploadOpen(true)}>Загрузить файл</button>
          <button className="iconbtn bankbtn" onClick={() => downloadBank(nodes, pool)} disabled={!nodes.length}>Скачать HTML</button>
        </>
      }
    >
      <BankBrowser nodes={nodes} pool={pool} embedded />
      {addOpen && <AddQuestionModal pool={pool} onClose={() => setAddOpen(false)} onCreated={() => { setAddOpen(false); changed(); }} />}
      {uploadOpen && <UploadModal pool={pool.id} onClose={() => setUploadOpen(false)} onImported={changed} />}
    </PageShell>
  );
}
