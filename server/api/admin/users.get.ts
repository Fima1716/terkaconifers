export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')
  return { users: loadUsers().map(toPublic) }
})
