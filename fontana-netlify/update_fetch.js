const fs = require('fs');

function updateFetch(file) {
    let content = fs.readFileSync(file, 'utf8');
    
    // Check if AbortController is already added
    if (content.includes('AbortController')) return;
    
    const newFetch = `  const executeFetch = () => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 10000);
    if (!args[1]) args[1] = {};
    args[1].signal = controller.signal;
    return originalFetch.apply(window, args).finally(() => clearTimeout(id));
  };
  const myPromise = fetchQueue.then(() => executeFetch(), () => executeFetch());`;
    
    content = content.replace(/  const executeFetch = \(\) => originalFetch\.apply\(window, args\);\n  const myPromise = fetchQueue\.then\(\(\) => executeFetch\(\), \(\) => executeFetch\(\)\);/g, newFetch);
    fs.writeFileSync(file, content);
}

updateFetch('/Users/loriorl/Documents/fontana-netlify/index.html');
updateFetch('/Users/loriorl/Documents/fontana-netlify/control-area.html');
console.log("Done");
