module.exports = (app, event) => {
  const formattedStartTime = new Date(event.startTime).toLocaleString();

  let html = `
    <main class="saito-calendar-event-link">
     <div class="saito-header-logo-wrapper" id="redsquare-link">
            <img class="saito-header-logo" alt="Logo" src="/saito/img/logo.svg" />
        </div>
            <section class="saito-calendar-event-link-body">
                <h2>${event.identifier}</h2>
                <div class="call-details">
                    <p><strong>Start Time:</strong> ${formattedStartTime}</p>
                    <p><strong>Duration:</strong> ${event.duration}</p>
                    <p><strong>Description:</strong> ${event.description}</p>
                    <div class="time-to-call"></div>
                </div>
                `;

  if (new Date(event.startTime).getTime() > Date.now() + 5 * 60 * 1000) {
    html += `<div id="add-to-calendar" class="saito-button-primary">Add Reminder</div>`;
  } else {
    html += `<div id="enter-call-button" class="saito-button-primary">Join</div>`;
  }

  html += `</section>
    </main>
    `;

  return html;
};
