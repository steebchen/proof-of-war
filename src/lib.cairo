// Models
pub mod models {
    pub mod player;
    pub mod building;
    pub mod troop;
    pub mod army;
    pub mod battle;
    pub mod clan;
}

// Systems
pub mod systems {
    pub mod village;
    pub mod building;
    pub mod resource;
    pub mod training;
    pub mod combat;
    pub mod clan;
}

// Utils
pub mod utils {
    pub mod config;
}

// Tests
#[cfg(test)]
pub mod tests {
    pub mod test_village;
    pub mod test_clan;
}
