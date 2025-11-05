
console.log("client starting");
let api_url = "https://tomt6.umbriac.com"
if (window.IS_DEV) {
console.log('Development environment detected, using localhost.');
  api_url = 'http://localhost:8080';
}

(async () => {
  get_lobbies();
  setInterval(get_lobbies, 1000);
})();

async function get_lobbies() {
  try {
    console.log("fetching lobbies");
    const response = await fetch(`${baseUrl}/games`);
    if (!response.ok) {
      document.getElementById("errors").innerHTML = "Failed to fetch game list.";
      return;
    }
    const data = await response.json();
    const container = document.getElementById('game-list-container');
    container.innerHTML = '';

    if (data.lobbies && data.lobbies.length > 0) {
      const lobbiesHeader = document.createElement('h4');
      lobbiesHeader.textContent = 'Lobbies';
      container.appendChild(lobbiesHeader);
      data.lobbies.forEach(lobby => {
        const div = document.createElement('div');
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'game_selection';
        radio.value = lobby.uuid;
        radio.id = `lobby-${lobby.uuid}`;

        const label = document.createElement('label');
        label.htmlFor = radio.id;
        label.textContent = ` ${lobby.name} (${lobby.playerCount} players)`;

        div.appendChild(radio);
        div.appendChild(label);
        container.appendChild(div);
      });
    }

    if ((!data.lobbies || data.lobbies.length === 0)) {
      container.textContent = 'No active lobbies. Try creating one!';
    }

  } catch (error) {
    console.error("Error fetching lobby list:", error);
    document.getElementById("errors").innerHTML = "Error fetching lobby list.";
  }
}

function enter_lobby(action) {
  const username = document.getElementById("username").value;
  if (!username) {
    document.getElementById("errors").innerHTML = "Please enter a username.";
    return;
  }

  let endpoint;
  let body;

  if (action === 'create') {
    const game_name = document.getElementById("new_lobby_name").value;
    if (!game_name) {
      document.getElementById("errors").innerHTML = "Please enter a lobby name.";
      return;
    }
    endpoint = `${baseUrl}/create`;
    body = JSON.stringify({
      game_name: game_name, 
      username: username
    });
  } else if (action === 'join') {
    const selectedLobby = document.querySelector('input[name="game_selection"]:checked');
    if (!selectedLobby) {
      document.getElementById("errors").innerHTML = "Please select a lobby to join.";
      return;
    }
    const game_uuid = selectedLobby.value;
    endpoint = `${baseUrl}/join`;
    body = JSON.stringify({
      game_uuid: game_uuid,
      username: username
    });
  } else {
    //bad, should not get here
    return;
  }

  fetch(endpoint, {
    method: "POST",
    body: body,
    headers: {
      "Content-type": "application/json; charset=UTF-8"
    }
  }).then(response => {
    if (!response.ok) {
      response.text().then(text => {
        document.getElementById("errors").innerHTML = text;
      });
      return Promise.reject('server error');
    }
    return response.json();
  })
    .then(data => {
      console.log(`Received data from /${action}:`, data);
      const uuid = data.host_uuid || data.player_uuid;
      if (uuid) {
        localStorage.setItem("uuid", uuid);
        sessionStorage.setItem("uuid", uuid);
        console.log("UUID set to", getParam("uuid") ,"in localStorage and sessionStorage.");
        window.location.href = `game.html?uuid=${uuid}`;
      } else {
        console.error("UUID not found in server response.");
        document.getElementById("errors").innerHTML = "Failed to get a valid ID from the server.";
      }
    })
    .catch(error => {
      console.error(`Error ${action}ing lobby:`, error);
      document.getElementById("errors").innerHTML = `Error ${action}ing lobby.`;
    });
}
