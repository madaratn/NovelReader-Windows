// How the libraries and Discover show their titles: a wall of covers ("posters", the
// default) or the detailed list. One choice for the whole app, kept on this device.
import{useEffect,useState}from'react'
import{lsGet,lsSet}from'./util'
export type CardView='posters'|'list'
const KEY='cardView',EVT='nr-card-view'
export const cardView=():CardView=>lsGet(KEY)==='list'?'list':'posters'
export function setCardView(v:CardView){lsSet(KEY,v);if(typeof window!=='undefined')window.dispatchEvent(new Event(EVT))}
export function useCardView():[CardView,(v:CardView)=>void]{
 const[v,setV]=useState<CardView>(cardView)
 useEffect(()=>{const f=()=>setV(cardView());window.addEventListener(EVT,f);return()=>window.removeEventListener(EVT,f)},[])
 return[v,setCardView]}
