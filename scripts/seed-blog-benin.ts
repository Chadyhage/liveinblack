import { getDb } from '../lib/db/mongoose'
import BlogPost from '../lib/models/BlogPost'
import { buildBeninCampaign } from './blog-benin-campaign'

async function main() {
  await getDb()
  const posts = buildBeninCampaign()
  let created = 0
  let updated = 0
  for (const post of posts) {
    const existed = await BlogPost.exists({ slug: post.slug })
    await BlogPost.findOneAndUpdate({ slug: post.slug }, { $set: post }, { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true })
    if (existed) updated += 1
    else created += 1
  }
  console.log(`Campagne Bénin : ${created} créé(s), ${updated} mis à jour, ${posts.length} articles vérifiés.`)
}

main().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1) })
