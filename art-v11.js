// Preserve the photographed calligraphy exactly: an SVG luminance-to-alpha
// mask removes the gray photo paper and a live blue gradient fills the ink.
fetch('assets/title-v11.svg').then(r=>r.text()).then(markup=>{
 document.querySelector('.title-art').innerHTML=markup.replace('href="title-source-v11.jpg"','href="assets/title-source-v11.jpg"');
});
