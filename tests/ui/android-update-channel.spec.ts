import {test,expect} from '@playwright/test'
import {newer,selectAndroidRelease} from '../../src/platform/android-update'

const asset=(v:string,prerelease=false,url?:string)=>({
  tag_name:'v'+v,
  prerelease,
  draft:false,
  assets:[{name:'NovelReader-'+v+'.apk',browser_download_url:url||'https://github.com/madaratn/NovelReader-Windows/releases/download/v'+v+'/NovelReader-'+v+'.apk',size:12345}]
})

test('Android update channel chooses only stable releases unless beta is enabled',()=>{
 const list=[asset('0.22.3',true),asset('0.22.2',false),asset('0.22.4',true)]
 expect(selectAndroidRelease(list,'0.22.1',false)?.v).toBe('0.22.2')
 expect(selectAndroidRelease(list,'0.22.1',true)?.v).toBe('0.22.4')
 expect(selectAndroidRelease(list,'0.22.4',true)).toBeNull()
 expect(selectAndroidRelease([asset('0.22.1',true)],'0.22.1',true)).toBeNull()
 expect(newer('0.22.3','0.22.2')).toBe(true)
})

test('Android beta channel refuses drafts, foreign assets and malformed release lists',()=>{
 const malicious=asset('0.99.0',true,'https://evil.test/malware.apk')
 const wrongRepo=asset('0.99.0',true,'https://github.com/attacker/repo/releases/download/v0.99.0/NovelReader-0.99.0.apk')
 const draft={...asset('0.98.0',true),draft:true}
 expect(selectAndroidRelease([malicious,wrongRepo,draft,asset('0.22.3',false)],'0.22.1',true)?.v).toBe('0.22.3')
 expect(selectAndroidRelease(null,'0.22.1',true)).toBeNull()
 expect(selectAndroidRelease([{tag_name:'v0.99.0',assets:null}], '0.22.1',true)).toBeNull()
})
