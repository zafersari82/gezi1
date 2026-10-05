"use client";

import { useActionState } from "react";

import { saveMerchant } from "@/lib/actions";
import { EMPTY_MERCHANT, type FormState, type MerchantFormValues } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

interface BusinessOption {
  id: string;
  name: string;
}

interface MerchantFormProps {
  miniAppId: string;
  /** Satıcının bağlanabileceği yayındaki işletmeler. */
  businesses: BusinessOption[];
}

const INITIAL_STATE: FormState<MerchantFormValues> = {
  error: null,
  saved: false,
  values: EMPTY_MERCHANT,
};

/** Mini uygulamaya ödeme alabilecek yeni bir satıcı bağlar. */
export function MerchantForm({ miniAppId, businesses }: MerchantFormProps) {
  const [state, formAction] = useActionState(saveMerchant.bind(null, miniAppId), INITIAL_STATE);
  const { values } = state;

  return (
    <form action={formAction} className="inline-form">
      <div className="field">
        <label htmlFor="merchantId">Satıcı kimliği</label>
        <input
          id="merchantId"
          name="merchantId"
          type="text"
          className="mono"
          defaultValue={values.merchantId}
          placeholder="kadikoy-berber"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="displayName">Ödeme ekranında görünen ad</label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          defaultValue={values.displayName}
          required
        />
      </div>
      <div className="field">
        <label htmlFor="businessId">İşletme (isteğe bağlı)</label>
        <select id="businessId" name="businessId" defaultValue={values.businessId}>
          <option value="">Bağlı işletme yok</option>
          {businesses.map((business) => (
            <option key={business.id} value={business.id}>
              {business.name}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton>Satıcıyı bağla</SubmitButton>
      <FormFeedback state={state} saved="Satıcı bağlandı." />
    </form>
  );
}
