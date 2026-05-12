/**
 * Тест VK постинга с фото.
 * Запуск: npx tsx test-vk.ts
 */
import 'dotenv/config'

const VK_TOKEN = process.env.VK_POST_TOKEN || ''
const VK_USER_TOKEN = process.env.VK_USER_TOKEN || ''
const VK_GROUP_ID = process.env.VK_POST_GROUP_ID || ''

if (!VK_TOKEN || !VK_GROUP_ID) {
  console.error('Missing VK_POST_TOKEN or VK_POST_GROUP_ID in .env')
  process.exit(1)
}

const TEST_PHOTO = 'https://terkaconifers.ru/photos/photo_1617@26-01-2025_16-26-36.jpg'
const TEST_TEXT = 'Тестовый пост — проверка публикации с фото. Удалите этот пост.'

async function run() {
  const photoToken = VK_USER_TOKEN || VK_TOKEN
  console.log(`VK_GROUP_ID: ${VK_GROUP_ID}`)
  console.log(`Using ${VK_USER_TOKEN ? 'USER token' : 'POST token'} for photo upload`)

  // 1. Get upload URL
  console.log('\n1. photos.getWallUploadServer...')
  const srvRes = await fetch(`https://api.vk.com/method/photos.getWallUploadServer?group_id=${VK_GROUP_ID}&access_token=${photoToken}&v=5.199`)
  const srvData = await srvRes.json()
  if (srvData.error) {
    console.error('ERROR:', srvData.error)
    process.exit(1)
  }
  const uploadUrl = srvData.response.upload_url
  console.log('OK, got upload URL')

  // 2. Download test photo
  console.log('\n2. Downloading test photo...')
  const photoResp = await fetch(TEST_PHOTO)
  const buf = Buffer.from(await photoResp.arrayBuffer())
  console.log(`OK, ${buf.length} bytes`)

  // 3. Upload to VK
  console.log('\n3. Uploading to VK...')
  const boundary = '----VK' + Date.now()
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="photo.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const upRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })
  const upData = await upRes.json()
  console.log(`photo=${!!upData.photo}, server=${upData.server}`)
  if (!upData.photo || upData.photo === '[]') {
    console.error('ERROR: empty photo after upload', upData)
    process.exit(1)
  }

  // 4. Save photo
  console.log('\n4. photos.saveWallPhoto...')
  const saveRes = await fetch(`https://api.vk.com/method/photos.saveWallPhoto?group_id=${VK_GROUP_ID}&photo=${encodeURIComponent(upData.photo)}&server=${upData.server}&hash=${upData.hash}&access_token=${photoToken}&v=5.199`)
  const saveData = await saveRes.json()
  const saved = saveData?.response?.[0]
  if (!saved) {
    console.error('ERROR:', saveData)
    process.exit(1)
  }
  const attachment = `photo${saved.owner_id}_${saved.id}`
  console.log(`OK: ${attachment}`)

  // 5. wall.post
  console.log('\n5. wall.post...')
  const params = new URLSearchParams({
    owner_id: `-${VK_GROUP_ID}`,
    from_group: '1',
    message: TEST_TEXT,
    attachments: attachment,
    access_token: VK_TOKEN,
    v: '5.199',
  })
  const postRes = await fetch(`https://api.vk.com/method/wall.post?${params}`)
  const postData = await postRes.json()
  if (postData.error) {
    console.error('ERROR:', postData.error)
    process.exit(1)
  }
  console.log(`OK! post_id: ${postData.response.post_id}`)
  console.log(`https://vk.com/wall-${VK_GROUP_ID}_${postData.response.post_id}`)
}

run().catch(err => { console.error(err); process.exit(1) })
