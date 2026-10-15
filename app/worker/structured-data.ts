import { CANONICAL_ORIGIN } from "../src/seo-config";
import { breadcrumbsForPath } from "../src/breadcrumb-data";
import type { DocumentMetadata } from "./metadata";
const publisher={"@type":"Organization",name:"Benchmark Registry",url:CANONICAL_ORIGIN};
export function structuredData(metadata:DocumentMetadata):Record<string,unknown> {
  const path=metadata.path ?? (metadata.canonical ? new URL(metadata.canonical).pathname : "/");
  const graph:Record<string,unknown>[]=[];
  if(path==="/") {
    graph.push({...publisher,"@id":`${CANONICAL_ORIGIN}/#organization`,logo:`${CANONICAL_ORIGIN}/assets/Benchmark-Registry-B-Logo-Dark.png`,
      sameAs:["https://github.com/rolling7ho/benchmark-registry"]});
    graph.push({"@type":"WebSite",name:"Benchmark Registry",url:CANONICAL_ORIGIN,publisher:{"@id":`${CANONICAL_ORIGIN}/#organization`}});
  } else graph.push({"@type":"BreadcrumbList",itemListElement:breadcrumbsForPath(path,metadata.page?.name,metadata.page?.familyName)
    // A missing page lists only the crumbs that exist, never its own URL.
    .filter(crumb=>(metadata.status ?? 200)===200 || crumb.path==="/").map((crumb,index)=>({
    "@type":"ListItem",position:index+1,name:crumb.name,item:CANONICAL_ORIGIN+crumb.path,
  }))});
  if(path!=="/") graph.push({"@type":"WebPage",name:metadata.title,description:metadata.description,url:metadata.canonical,
    ...(metadata.page?.updated ? {dateModified:metadata.page.updated} : {}),publisher});
  if(metadata.page && ["model","benchmark","benchmark-version","comparison"].includes(metadata.page.kind)) graph.push({
    "@type":"Dataset",name:metadata.page.name,description:metadata.description,url:metadata.canonical,
    ...(metadata.page.updated ? {dateModified:metadata.page.updated} : {}),creator:publisher,publisher,
    citation:metadata.page.sources,
  });
  return {"@context":"https://schema.org","@graph":graph};
}
export function structuredDataScript(metadata:DocumentMetadata):string {
  // Prevent entity names/source fragments from closing an executable script tag.
  const json=JSON.stringify(structuredData(metadata)).replace(/</gu,"\\u003c").replace(/\u2028/gu,"\\u2028").replace(/\u2029/gu,"\\u2029");
  return `<script type="application/ld+json">${json}</script>`;
}
