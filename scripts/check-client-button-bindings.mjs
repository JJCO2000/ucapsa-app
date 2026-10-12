import fs from 'node:fs';
import path from 'node:path';

// Static handler / literal-route audit across Client, Auth and Admin screens.
// Not an emulator interaction test; do not claim buttons were physically tapped.
const root = process.cwd();
const errors = [];
const tabNames = ['announcements','calendar','classes','dog','home','membership','payments','profile','services'];
const standalone = ['account-settings','achievements','attendance','privacy','request-membership','restaurant','reviews','terms'];
const adminTabs = ['admin-classes','admin-clients','admin-communication','admin-home','admin-more','admin-payments'];
const trainerTabs = ['trainer-home','trainer-classes','trainer-exams','trainer-more'];
function collect(dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, {withFileTypes:true}).flatMap(entry => {
    const p = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? collect(p) : (entry.isFile() && p.endsWith('.tsx') ? [p] : []);
  });
}
const screens = [
  ...collect('src/app/client'),...collect('src/app/auth'),...collect('src/screens/home'),
  ...collect('src/app/admin'),...collect('src/app/staff'),
  ...adminTabs.map(name => 'src/app/(tabs)/'+name+'.tsx'),
  ...trainerTabs.map(name => 'src/app/(tabs)/'+name+'.tsx'),
  ...tabNames.map(name => 'src/app/(tabs)/'+name+'.tsx'),
  ...standalone.map(name => 'src/app/'+name+'.tsx'),
].filter((file,index,all) => all.indexOf(file)===index);

// Audit every TSX source too, because reusable components can own real press
// surfaces and routes even when the screen only renders the component.
const sourceTsxFiles = collect('src');
const auditedFiles = sourceTsxFiles.filter((file,index,all) => all.indexOf(file)===index);
let buttonCount=0, routesChecked=0;
let screenButtonCount=0;
let trainerStaffButtons=0;
const trainerStaffScreens = new Set([
  ...collect('src/app/staff'),
  ...trainerTabs.map(name => 'src/app/(tabs)/'+name+'.tsx'),
]);
function jsxOpeningTag(source, offset) {
  let depth=0,quote='',escaped=false;
  for (let i=offset;i<source.length;i+=1) {
    const c=source[i];
    if(quote) {
      if(escaped) escaped=false;
      else if(c==='\\') escaped=true;
      else if(c===quote) quote='';
    } else if (c==='"' || c==="'" || c.charCodeAt(0)===96) quote=c;
    else if(c==='{') depth+=1;
    else if(c==='}') depth-=1;
    else if(c==='>' && depth===0) return source.slice(offset,i+1);
    if(depth<0) break;
  }
  throw new Error('Unclosed JSX press surface near byte '+offset);
}
function routeExists(route) {
  const bare=route.split('?')[0].replace(/\/$/,'') || '/';
  if(bare.includes(String.fromCharCode(36,123))) return true;
  const normalized=bare==='/' ? 'index' : bare.replace(/^\//,'');
  return ['src/app/'+normalized+'.tsx','src/app/(tabs)/'+normalized+'.tsx','src/app/'+normalized+'/index.tsx']
    .some(p => fs.existsSync(path.join(root,p)));
}
for(const screen of screens) {
  if(!fs.existsSync(path.join(root,screen))) errors.push('Missing expected screen: '+screen);
}

for(const screen of auditedFiles) {
  const full=path.join(root,screen);
  const source=fs.readFileSync(full,'utf8');
  for(const match of source.matchAll(/<(?:Pressable|TouchableOpacity|TouchableHighlight|Button)\b/g)) {
    const opening=jsxOpeningTag(source,match.index);
    const line=source.slice(0,match.index).split('\n').length;
    buttonCount+=1;
    if (screens.includes(screen)) screenButtonCount+=1;
    if (trainerStaffScreens.has(screen)) trainerStaffButtons+=1;
    if(!/\bonPress\s*=/.test(opening)) {
      errors.push(screen+':'+line+' has no onPress');
      continue;
    }

    if (/\bonPress\s*=\s*\{\s*undefined\s*\}/.test(opening)
      || /\bonPress\s*=\s*\{\s*null\s*\}/.test(opening)
      || /\bonPress\s*=\s*\{\s*\(\s*\)\s*=>\s*(?:undefined|null)\s*\}/.test(opening)
      || /\bonPress\s*=\s*\{\s*\(\s*\)\s*=>\s*\{\s*\}\s*\}/.test(opening)) {
      errors.push(screen+':'+line+' has a no-op onPress');
    }
  }
  for(const match of source.matchAll(/\brouter\.(?:push|replace|navigate)\s*\(\s*(['"\x60])(\/[^'"\x60]*?)\1/g)) {
    const route=match[2];routesChecked+=1;
    if(!routeExists(route)) errors.push(screen+':'+source.slice(0,match.index).split('\n').length+' missing destination '+route);
  }
}
if(screens.length<105 || screenButtonCount<400) {
  errors.push('Screen scope shrank: '+screens.length+' screens/'+screenButtonCount+' buttons');
}
if(auditedFiles.length<140 || buttonCount<450) {
  errors.push('Full TSX scope shrank: '+auditedFiles.length+' files/'+buttonCount+' press surfaces');
}
if(trainerStaffScreens.size<7 || trainerStaffButtons<30) {
  errors.push('Trainer/Staff scope shrank: '+trainerStaffScreens.size+' screens/'+trainerStaffButtons+' buttons');
}
if(errors.length){console.error('CLIENT BUTTONS FAIL');errors.forEach(e=>console.error(e));process.exit(1);}
console.log(
  'CLIENT / ADMIN / TRAINER BUTTONS PASS '
  +screens.length+' screens/'
  +buttonCount+' press handlers/'
  +routesChecked+' literal routes; TRAINER/STAFF '
  +trainerStaffScreens.size+' screens/'
  +trainerStaffButtons+' press handlers',
);
