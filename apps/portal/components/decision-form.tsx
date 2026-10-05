"use client";

import { useActionState } from "react";

import { decideVersion } from "@/lib/actions";
import { EMPTY_NOTE, type FormState, type NoteFormValues } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

type Decision = "approve" | "reject" | "revoke";

interface DecisionFormProps {
  packageId: string;
  version: string;
  decision: Decision;
}

const COPY: Record<
  Decision,
  { title: string; label: string; hint: string; button: string; done: string; danger: boolean }
> = {
  approve: {
    title: "Onayla",
    label: "Not (isteğe bağlı)",
    hint: "Onaylanan sürüm uygulama kayıtlarında yayınlanabilir.",
    button: "Sürümü onayla",
    done: "Sürüm onaylandı.",
    danger: false,
  },
  reject: {
    title: "Reddet",
    label: "Gerekçe",
    hint: "Gerekçe yükleyene gösterilir. Düzeltme, yeni bir sürüm numarasıyla yüklenir.",
    button: "Sürümü reddet",
    done: "Sürüm reddedildi.",
    danger: true,
  },
  revoke: {
    title: "Geri çek",
    label: "Gerekçe",
    hint: "Sürümü yayınlayan bütün kayıtlar kullanıcılara hemen kapanır ve dosyaları sunulmaz.",
    button: "Onaylı sürümü geri çek",
    done: "Sürüm geri çekildi.",
    danger: true,
  },
};

const INITIAL_STATE: FormState<NoteFormValues> = { error: null, saved: false, values: EMPTY_NOTE };

/** İnceleme kararı: onay, ret ya da onaylı sürümün geri çekilmesi. */
export function DecisionForm({ packageId, version, decision }: DecisionFormProps) {
  const [state, formAction] = useActionState(
    decideVersion.bind(null, packageId, version, decision),
    INITIAL_STATE,
  );
  const copy = COPY[decision];
  const noteId = `note-${decision}`;

  return (
    <form action={formAction} className="decision">
      <h3>{copy.title}</h3>
      <div className="field">
        <label htmlFor={noteId}>{copy.label}</label>
        <textarea
          id={noteId}
          name="note"
          defaultValue={state.values.note}
          required={decision !== "approve"}
          maxLength={500}
          aria-describedby={`${noteId}-hint`}
        />
        <p className="hint" id={`${noteId}-hint`}>
          {copy.hint}
        </p>
      </div>
      {decision === "revoke" && (
        <div className="checks">
          <label>
            <input type="checkbox" name="rollback" defaultChecked />
            <span>
              Kayıtları önceki yayınlarına döndür
              <small>
                Önceki yayını olmayan kayıtlar, yeni bir sürüm yayınlanana kadar kapalı kalır.
              </small>
            </span>
          </label>
        </div>
      )}
      <div className="form-footer">
        <SubmitButton
          variant={copy.danger ? "danger" : "primary"}
          {...(decision === "revoke"
            ? { confirm: "Sürüm geri çekilsin mi? Bu işlem geri alınamaz." }
            : {})}
        >
          {copy.button}
        </SubmitButton>
        <FormFeedback state={state} saved={copy.done} />
      </div>
    </form>
  );
}
