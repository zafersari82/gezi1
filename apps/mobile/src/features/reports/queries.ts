import { useMutation } from "@tanstack/react-query";
import type { CreateReportBody } from "@vado/contracts";

import { api } from "@/api/client";

export function useCreateReport() {
  return useMutation({
    mutationFn: (body: CreateReportBody) => api.post("/v1/reports", body),
  });
}
