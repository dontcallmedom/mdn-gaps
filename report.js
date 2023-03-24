const gaps = await fetch("results.json").then(r => r.json());

const gapIds = {
  idl: ["idl"],
  css: ["css.properties", "css.atrules"],
  elements: ["elements"]
};

const browserEngines = {
  "chrome": "https://cdn.w3.org/assets/logos/browser-logos/chrome/chrome.svg",
  "firefox": "https://cdn.w3.org/assets/logos/browser-logos/firefox/firefox.svg",
  "safari": "https://cdn.w3.org/assets/logos/browser-logos/safari-ios/safari-ios.svg"
};

function idlStubLink(feature, memberName, memberType, isStatic) {
  const stubLink = document.createElement("a");
  stubLink.title = `Generate stub for ${feature + memberName ? "." + memberName : ""} MDN page`;
  stubLink.textContent = "[stub]";
  stubLink.href = `https://dontcallmedom.github.io/mdn-scaffold/?interface=${feature}&${memberName ? `member=${memberType}|${memberType === "constructor" ? memberType : memberName}${isStatic ? "|static" : ""}}` : ""}`;
return stubLink;
}

function bcdSupport(name, support) {
  const ret = [];
  for (const engine in browserEngines) {
    if (support[engine] === true) {
      const img = document.createElement("img");
      img.width = 20;
      img.src = browserEngines[engine];
      img.alt = `${name} supported in ${engine}`;
      ret.push(img);
    }
  }
  return ret;
}

for (const id of Object.keys(gapIds)) {
  const table = document.getElementById(id);
  for(let shortname of Object.keys(gaps).sort((s1, s2) => gaps[s1].title?.localeCompare(gaps[s2]?.title))) {
    let tr = document.createElement("tr");
    const th = document.createElement("th");
    tr.appendChild(th);
    const specData= gaps[shortname];
    for (const gapId of gapIds[id]) {
      if (specData[gapId]) {
	if (!th.textContent) {
	  if (specData.url) {
	    const link = document.createElement("a");
	    link.href = specData.url;
	    link.textContent = specData.title;
	    th.append(link);
	  } else {
	    th.textContent = shortname;
	  }
	}
	const gaps = Object.keys(specData[gapId]);
	th.setAttribute("rowspan", gaps.length );
	for (let feature of [...gaps]) {
	  const bcdTd = document.createElement("td");
	  const mdnTd = document.createElement("td");
	  const div = document.createElement("div");
	  if (specData[gapId][feature].bcd) {
	    bcdTd.textContent = feature;
	    bcdTd.className = "missing";
	  }
	  if (specData[gapId][feature].mdn) {
	    const nameSpan = document.createElement("span");
	    const supportSpan = document.createElement("span");
	    nameSpan.textContent = feature;
	    div.append(nameSpan);
	    if (gapId === "idl") {
	      div.append(" ", idlStubLink(feature));
	    }
	    if (specData[gapId][feature].bcdSupport) {
	      const images = bcdSupport(feature, specData[gapId][feature].bcdSupport);
	      supportSpan.append(...images);
	    }
	    div.append(supportSpan);
	    mdnTd.append(div);
	    mdnTd.className = "mdn missing";
	  }
	  if (specData[gapId][feature].members) {
	    const bcdUl = document.createElement("ul");
	    const mdnUl = document.createElement("ul");
	    Object.keys(specData[gapId][feature].members).forEach(t => {
	      const nameSpan = document.createElement("span");
	      const supportSpan = document.createElement("span");
	      const f = specData[gapId][feature].members[t];
	      const li = document.createElement("li");
	      nameSpan.textContent = feature + "." + t;
	      li.append(nameSpan);
	      if (f.bcd) {
		bcdUl.append(li.cloneNode(true));
	      }
	      if (f.mdn) {
		if (gapId === "idl") {
		  li.append(" ", idlStubLink(feature, t, f.type, f.isStatic));
		}
		if (f.bcdSupport) {
		  supportSpan.append(...bcdSupport(feature + "." + t, f.bcdSupport));
		}
		li.append(supportSpan);
		mdnUl.append(li);
	      }
	    });
	    if (bcdUl.childElementCount) {
	      bcdTd.append(bcdUl);
	      bcdTd.className = "missing";
	    }
	    if (mdnUl.childElementCount) {
	      mdnTd.append(mdnUl);
	      mdnTd.className = "mdn missing";
	    }
	  }
	  tr.append(bcdTd, mdnTd);
	  table.append(tr);
	  tr = document.createElement("tr");
	}
      }
    }
  }
}
