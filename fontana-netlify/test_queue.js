const originalFetch = async () => {
    console.log("fetching...");
    throw new Error("failed");
};

let fetchQueue = Promise.resolve();

function fetchOld(...args) {
    const executeFetch = () => originalFetch(...args);
    fetchQueue = fetchQueue.then(() => executeFetch()).catch(() => executeFetch());
    return fetchQueue;
}

fetchOld().then(() => console.log("success")).catch(e => console.log("failed with", e.message));
