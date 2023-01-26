const gaps = await fetch("results.json").then(r => r.json());

const gapIds = {
  idl: ["idl"],
  css: ["css.properties", "css.atrules"],
  elements: ["elements"]
};

function idlStubLink(feature, memberName, memberType, isStatic) {
  const stubLink = document.createElement("a");
  stubLink.title = `Generate stub for ${feature + memberName ? "." + memberName : ""} MDN page`;
  stubLink.textContent = "[stub]";
  stubLink.href = `https://dontcallmedom.github.io/mdn-scaffold/?interface=${feature}&${memberName ? `member=${memberType}|${memberName}${isStatic ? "|static" : ""}}` : ""}`;
return stubLink;
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
	  if (specData[gapId][feature].bcd) {
	    bcdTd.textContent = feature;
	    bcdTd.className = "missing";
	  }
	  if (specData[gapId][feature].mdn) {
	    mdnTd.textContent = feature;
	    if (gapId === "idl") {
	      mdnTd.append(document.createTextNode(" "), idlStubLink(feature));
	    }
	    mdnTd.className = "missing";
	  }
	  if (specData[gapId][feature].members) {
	    const bcdUl = document.createElement("ul");
	    const mdnUl = document.createElement("ul");
	    Object.keys(specData[gapId][feature].members).forEach(t => {
	      const f = specData[gapId][feature].members[t];
	      const li = document.createElement("li");
	      li.textContent = feature + "." + t;
	      if (f.bcd) {
		bcdUl.append(li.cloneNode(true));
	      }
	      if (f.mdn) {
		if (gapId === "idl") {
		  li.append(document.createTextNode(" "), idlStubLink(feature, t, f.type, f.isStatic));
		}
		mdnUl.append(li);
	      }
	    });
	    if (bcdUl.childElementCount) {
	      bcdTd.append(bcdUl);
	      bcdTd.className = "missing";
	    }
	    if (mdnUl.childElementCount) {
	      mdnTd.append(mdnUl);
	      mdnTd.className = "missing";
	    }
	  }
	  if (specData[gapId][feature].mdn) {
	    if (Array.isArray(specData[gapId][feature].mdn)) {
	      const ul = document.createElement("ul");
	      specData[gapId][feature].mdn.forEach(t => {
		const li = document.createElement("li");
		li.textContent = feature + "." + t;
		if (id === "idl") {
		  const stubLink = document.createElement("a");
		  stubLink.title = `Generate stub for ${li.textContent} MDN page`;
		  stubLink.textContent = "[stub]";
		  stubLink.href = `https://dontcallmedom.github.io/mdn-scaffold/?interface=${feature}&member=${(t.endsWith('()') ? "operation|" : "attribute|") + t.replace("()", "")}`; // TODO this doesn't deal with static properties / operations
		  li.textContent += " ";
		  li.append(stubLink);
		}
		ul.appendChild(li);
	      });
	      mdnTd.appendChild(ul);
	    } else {
	      mdnTd.textContent = feature;
	      if (id === "idl") {
		const stubLink = document.createElement("a");
		stubLink.title = `Generate stub for ${feature} MDN page`;
		stubLink.textContent = "[stub]";
		stubLink.href = `https://dontcallmedom.github.io/mdn-scaffold/?interface=${feature}`;
		mdnTd.textContent += " ";
		mdnTd.append(stubLink);
		}
	    }
	    mdnTd.className = "missing";
	  }
	  tr.append(bcdTd, mdnTd);
	  table.append(tr);
	  tr = document.createElement("tr");
	}
      }
    }
  }
}
