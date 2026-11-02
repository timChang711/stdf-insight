import { feedbackAdminAccess, feedbackDb, feedbackError, feedbackJson } from "../../../lib/feedback-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const access = await feedbackAdminAccess();
    if(access!=="allowed") return feedbackJson({error:access},access==="unauthorized"?401:403);
    const daysValue = new URL(request.url).searchParams.get("days") ?? "7";
    if(daysValue!=="7"&&daysValue!=="30") return feedbackJson({error:"validation"},400);
    const days=Number(daysValue), now=Date.now(), dayMs=86400000;
    const start = Math.floor((now+8*3600000)/dayMs)*dayMs-8*3600000-(days-1)*dayMs;
    const db=feedbackDb();
    const [summary,daily,features,errors] = await db.batch<Record<string, string | number>>([
      db.prepare("SELECT COUNT(DISTINCT visitor_key) AS visitors, COALESCE(SUM(event='page_view'),0) AS pageViews, COALESCE(SUM(event='feature'),0) AS interactions, COALESCE(SUM(event='error'),0) AS errors FROM usage_events WHERE created_at >= ?").bind(start),
      db.prepare("SELECT day AS date, COUNT(DISTINCT visitor_key) AS visitors, SUM(event='page_view') AS pageViews, SUM(event='feature') AS interactions, SUM(event='error') AS errors FROM usage_events WHERE created_at >= ? GROUP BY day ORDER BY day").bind(start),
      db.prepare("SELECT name, COUNT(*) AS count FROM usage_events WHERE event='feature' AND created_at >= ? GROUP BY name ORDER BY count DESC, name").bind(start),
      db.prepare("SELECT name, COUNT(*) AS count FROM usage_events WHERE event='error' AND created_at >= ? GROUP BY name ORDER BY count DESC, name").bind(start),
    ]);
    const series=Array.from({length:days},(_,index)=>{
      const date=new Date(start+index*dayMs+8*3600000).toISOString().slice(0,10);
      return daily.results.find(row=>row.date===date) ?? {date,visitors:0,pageViews:0,interactions:0,errors:0};
    });
    return feedbackJson({days,...summary.results[0],daily:series,features:features.results,errorTypes:errors.results,updatedAt:now});
  } catch(error) {return feedbackError(error);}
}
