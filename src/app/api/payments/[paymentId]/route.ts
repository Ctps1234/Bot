import { ordersRepo } from "@/server/db/orders";
import { notFound, numberParam, ok, withAuth } from "@/server/api";

export const DELETE = withAuth(["ADMIN", "GESTOR"], async (_request, _user, ctx) => {
  const paymentId = await numberParam(ctx, "paymentId");
  const order = ordersRepo.deletePayment(paymentId);
  if (!order) throw notFound("Pagamento");
  return ok({ order: ordersRepo.findDetailed(order.id) });
});
