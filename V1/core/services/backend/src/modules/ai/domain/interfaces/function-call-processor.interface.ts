export type FunctionCallProcessorHandler = (payload: {
  function_call_name: string;
  result: string;
  attendance_id: string;
  client_phone: string;
  correlation_id?: string;
}) => Promise<{
  output: string | null;
  data?: Record<string, unknown>;
  processed: boolean;
}>;
