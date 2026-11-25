// Presentation only: retain every table cell and scroll the existing table.
const tableRegions = '.key-metrics-table-scroll, .revision-table-scroll, .source-table-wrap, .argus-table-wrap';
let regionId = 0;

export function installTableNavigation(root) {
  const view = root.ownerDocument.defaultView;
  const regions = new Map();
  let scheduled = false;
  let stopped = false;
  const make = (tag, className, text) => {
    const node = root.ownerDocument.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  function refresh() {
    scheduled = false;
    if (stopped) return;
    for (const [region, state] of regions) {
      if (!root.contains(region)) {
        resize?.unobserve(region);
        resize?.unobserve(state.table);
        region.removeEventListener('reader:year-focus',state.update);
        region.removeEventListener('scroll', state.update);
        region.removeEventListener('keydown', state.keydown);
        state.toolbar.remove();
        regions.delete(region);
      }
    }
    root.querySelectorAll(tableRegions).forEach(region => {
      if (regions.has(region)) return;
      const table = region.querySelector('table');
      const headings = [...(table?.querySelector('thead tr')?.children || [])].slice(1);
      if (!headings.length) return;
      const labels = headings.map(cell => [...cell.childNodes].map(node => node.textContent.trim()).filter(Boolean).join(' ').replace(/\s+/g, ' '));
      region.id ||= `report-table-${++regionId}`;
      region.tabIndex = 0;
      region.setAttribute('role', 'region');
      const name = region.getAttribute('aria-label') || region.closest('section')?.querySelector('h2, h3, strong')?.textContent || 'Financial table';
      if (!region.hasAttribute('aria-label')) region.setAttribute('aria-label', `${name}: all columns; use left/right arrows or Home/End to scroll`);
      const toolbar = make('div', 'table-navigation', '');
      toolbar.hidden = true;
      const summary = make('span', 'table-column-range', `All ${labels.length} columns · ${labels[0]}${labels.length > 1 ? ` … ${labels.at(-1)}` : ''}`);
      const controls = make('div', 'table-navigation-buttons', '');
      const left = make('button', '', '←');
      const right = make('button', '', '→');
      [left, right].forEach((button, index) => {
        button.type = 'button';
        button.setAttribute('aria-controls', region.id);
        button.setAttribute('aria-label', `${name}: scroll ${index ? 'right' : 'left'}`);
        button.title = `Scroll ${index ? 'right for more columns' : 'left'}`;
        button.addEventListener('click', () => {
          const stickyWidth = table.querySelector('th')?.getBoundingClientRect().width || 0;
          const distance = Math.max(100, region.clientWidth - stickyWidth - 40);
          region.scrollBy({left: (index ? 1 : -1) * distance, behavior: view.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
        });
      });
      const firstForecast=headings.find(h=>h.matches('.forecast-column,.forecast-col'));
      const jump=firstForecast && headings.indexOf(firstForecast)>0 ? make('button','jump-to-forecast','First forecast') : null;
      if(jump){
        jump.type='button';jump.setAttribute('aria-controls',region.id);
        jump.setAttribute('aria-label',`${name}: jump to first forecast, ${firstForecast.textContent.trim()}`);
        jump.onclick=()=>{
          const sticky=table.querySelector('thead th')?.getBoundingClientRect().width || 0;
          region.scrollTo({left:region.scrollLeft+firstForecast.getBoundingClientRect().left-region.getBoundingClientRect().left-sticky,behavior:view.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
        };
        controls.append(jump);
      }
      controls.append(left, right);
      toolbar.append(summary, controls);
      region.before(toolbar);
      const update = () => {
        const year=region.dataset.focusYear;
        const visible=labels.filter((_,i)=>!headings[i].hidden);
        const message=year?'FY '+year+' · '+visible.length+' '+(visible.length===1?'column':'columns'):`All ${labels.length} columns · ${labels[0]}${labels.length>1?' … '+labels.at(-1):''}`;
        if(summary.textContent!==message)summary.textContent=message;
        if(jump)jump.hidden=!!year;
        const overflow = Math.max(0, region.scrollWidth - region.clientWidth);
        toolbar.hidden = region.clientWidth === 0 || overflow <= 2;
        left.disabled = region.scrollLeft <= 2;
        right.disabled = region.scrollLeft >= overflow - 2;
      };
      const keydown = event => {
        if (event.target !== region || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        region.scrollTo({left: event.key === 'Home' ? 0 : region.scrollWidth, behavior:'instant'});
      };
      regions.set(region, {toolbar, table, update, keydown});
      region.addEventListener('reader:year-focus',update);
      region.addEventListener('scroll', update, {passive:true});
      region.addEventListener('keydown', keydown);
      resize?.observe(region);
      resize?.observe(table);
    });
    regions.forEach(state => state.update());
  }
  function schedule() {
    if (scheduled || stopped) return;
    scheduled = true;
    (view.requestAnimationFrame?.bind(view) || view.setTimeout.bind(view))(refresh);
  }
  const resize = view.ResizeObserver ? new view.ResizeObserver(schedule) : null;
  const changes = new view.MutationObserver(schedule);
  changes.observe(root, {childList:true, subtree:true, attributes:true, attributeFilter:['open']});
  view.addEventListener('resize', schedule);
  schedule();
  return () => {
    stopped = true;
    resize?.disconnect();
    changes.disconnect();
    view.removeEventListener('resize', schedule);
    for (const [region, state] of regions) {
      region.removeEventListener('reader:year-focus',state.update);
        region.removeEventListener('scroll', state.update);
      region.removeEventListener('keydown', state.keydown);
      state.toolbar.remove();
    }
    regions.clear();
  };
}
