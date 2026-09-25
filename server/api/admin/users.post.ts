export default defineEventHandler(async (event) => {
  await requireAuth(event, 'super_admin')

  const { username, password, displayName, role, gardens } = await readBody(event)

  if (!username || !password) {
    throw createError({ statusCode: 400, message: 'Укажите username и password' })
  }
  if (!/^[a-zA-Z0-9_]{2,30}$/.test(username)) {
    throw createError({ statusCode: 400, message: 'Username: 2-30 символов, латиница, цифры, _' })
  }
  if (password.length < 4) {
    throw createError({ statusCode: 400, message: 'Пароль минимум 4 символа' })
  }

  const users = loadUsers()
  if (users.find(u => u.username === username)) {
    throw createError({ statusCode: 409, message: 'Пользователь уже существует' })
  }

  const { hash, salt } = hashPassword(password)
  const user: any = {
    username,
    displayName: displayName || username,
    role: normalizeRole(role),
    gardens: Array.isArray(gardens) ? gardens : [],
    passwordHash: hash,
    salt,
    createdAt: new Date().toISOString(),
    lastLogin: '',
  }

  users.push(user)
  saveUsers(users)

  return { user: toPublic(user) }
})
