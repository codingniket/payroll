import { HttpError, createEmployee, deleteEmployee, listEmployees, updateEmployee } from "@/lib/server/service";

type Context = { params: Promise<{ segments?: string[] }> };
const respond = (error: unknown) => {
  const known = error instanceof HttpError ? error : new HttpError("Employees could not be updated.", 500);
  return Response.json({ message: known.message }, { status: known.status });
};

export async function GET() {
  try { return Response.json(await listEmployees()); } catch (error) { return respond(error); }
}

export async function POST(request: Request) {
  try { return Response.json(await createEmployee(await request.json()), { status: 201 }); } catch (error) { return respond(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const code = (await context.params).segments?.[0];
    if (!code) throw new HttpError("Employee was not found.", 404);
    return Response.json(await updateEmployee(code, await request.json()));
  } catch (error) { return respond(error); }
}

export async function DELETE(_request: Request, context: Context) {
  try {
    const code = (await context.params).segments?.[0];
    if (!code) throw new HttpError("Employee was not found.", 404);
    return Response.json(await deleteEmployee(code));
  } catch (error) { return respond(error); }
}
