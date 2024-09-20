function MakeGradeUpdatePostRequest(grade, hasSimEnded) {

  const ltik = getCookie(document.cookie, 'ltik');
  const ltikString = String(ltik);

  fetch("/mpcl1/submitGrade", {
      method: "POST",
      headers: { "Content-Type": "application/json"},
      body: JSON.stringify({
          completionStatus: grade,
          ltik: ltikString,
          simCompleted: hasSimEnded
      })
  })
  .then((response) => response.json())
  .then((json) => console.log(json))
}

function getCookie(cookieString, tokenString) {
  const cookieArray = cookieString.split(';');
  const cookies = {};
  cookieArray.forEach(cookie => {
      const [name, value] = cookie.trim().split('='); 
      cookies[name] = value; 
  });
  return cookies[tokenString]; 
}
