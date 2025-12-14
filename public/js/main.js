function toggleMenu() {
    const menu = document.getElementById("dropdown");
    menu.classList.toggle("show")
}

function openEdit(tileId) {
    const allTiles = document.querySelectorAll('.setting-tile');
    allTiles.forEach(tile => tile.classList.remove('editing'));

    const tile = document.getElementById(tileId);
    if (tile) {
        tile.classList.add("editing");
    }
}

function closeEdit(tileId, event) {
    if (event) {
        event.stopPropagation();
    }

    const tile = document.getElementById(tileId);
    if (tile) {
        tile.classList.remove("editing");
    }
}

window.onclick = function(event) {
    if (!event.target.closest(".user-menu")) {
        const menu = document.getElementById("dropdown");
        if (menu.classList.contains("show")) {
            menu.classList.remove("show");
        }
    }
}

document.addEventListener("DOMContentLoaded", function() {

    const birthdayTile = document.getElementById("birthdayTile");
    
    if (birthdayTile) {

        const savedDate = birthdayTile.getAttribute("data-birthday");

        if (savedDate) {
            const parts = savedDate.split("-");
            if (parts.length === 3) {
                const monthInput = document.getElementById("dobMonth");
                const dayInput = document.getElementById("dobDay");
                const yearInput = document.getElementById("dobYear");

                if (monthInput) {
                    monthInput.value = parts[0];
                }

                if (yearInput) {
                    yearInput.value = parts[2];
                }
                
                if (dayInput) {
                    dayInput.value = parts[1];
                }
            }
        }
    }
});

function combineBirthday() {
    const monthInput = document.getElementById("dobMonth");
    const dayInput = document.getElementById("dobDay");
    const yearInput = document.getElementById("dobYear");
    const finalInput = document.getElementById("finalBirthday");

    if (yearInput && monthInput && dayInput && finalInput) {
        const y = yearInput.value;
        const m = monthInput.value;
        let d = dayInput.value;

        if (y && m && d) {
            if (d.length === 1) d = "0" + d;
            finalInput.value = `${m}-${d}-${y}`;
        } else {
            finalInput.value = ""; 
        }
    }
}

function setGender(value) {
    document.getElementById("finalGender").value = value;
}

function selectOtherRadio() {
    document.getElementById("otherRadio").checked = true;
}

function focusOtherInput() {
    const input = document.getElementById("otherInput");
    input.focus();
    document.getElementById('finalGender').value = input.value;
}