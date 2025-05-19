use std::collections::LinkedList;

use rayon::prelude::*;

use crate::core::consensus::transaction::Transaction;
use crate::core::defs::SaitoHash;
use crate::core::util::crypto::hash;
use crate::iterate_mut;

#[derive(PartialEq)]
pub enum TraverseMode {
    DepthFist,
    BreadthFirst,
}

enum NodeType {
    Node {
        left: Option<Box<MerkleTreeNode>>,
        right: Option<Box<MerkleTreeNode>>,
    },
    Transaction {
        index: usize,
    },
}

pub struct MerkleTreeNode {
    node_type: NodeType,
    hash: Option<SaitoHash>,
    count: usize,
    is_spv: bool,
}

impl MerkleTreeNode {
    fn new(
        node_type: NodeType,
        hash: Option<SaitoHash>,
        count: usize,
        is_spv: bool,
    ) -> MerkleTreeNode {
        MerkleTreeNode {
            node_type,
            hash,
            count,
            is_spv,
        }
    }

    pub fn get_hash(&self) -> Option<SaitoHash> {
        return self.hash;
    }
}

pub struct MerkleTree {
    root: Box<MerkleTreeNode>,
}

impl MerkleTree {
    pub fn len(&self) -> usize {
        self.root.count
    }

    pub fn get_root_hash(&self) -> SaitoHash {
        return self.root.hash.unwrap();
    }

    pub fn generate(transactions: &Vec<Transaction>) -> Option<Box<MerkleTree>> {
        if transactions.is_empty() {
            return None;
        }

        let mut leaves: LinkedList<Box<MerkleTreeNode>> = LinkedList::new();

        // Create leaves for the Merkle tree
        for (index, tx) in transactions.iter().enumerate() {
            if tx.txs_replacements > 1 {
                for _ in 0..tx.txs_replacements {
                    leaves.push_back(Box::new(MerkleTreeNode::new(
                        NodeType::Transaction { index },
                        Some(tx.hash_for_signature.unwrap_or([0; 32])),
                        1,
                        true, // is_spv
                    )));
                }
            } else {
                leaves.push_back(Box::new(MerkleTreeNode::new(
                    NodeType::Transaction { index },
                    tx.hash_for_signature,
                    1,
                    false, // is_spv
                )));
            }
        }

        // Combine leaves into nodes to form the tree

        while leaves.len() > 1 {
            let mut nodes: LinkedList<MerkleTreeNode> = Default::default();

            // Create a node per two leaves
            while !leaves.is_empty() {
                let left = leaves.pop_front();
                let right = leaves.pop_front(); //Can be None, this is expected
                let count = MerkleTree::calculate_child_count(&left, &right);

                if right.is_some() {
                    nodes.push_back(MerkleTreeNode::new(
                        NodeType::Node { left, right },
                        None,
                        count,
                        false,
                    ));
                } else {
                    let hash = left.as_ref().unwrap().get_hash();
                    nodes.push_back(MerkleTreeNode::new(
                        NodeType::Node { left, right },
                        hash,
                        count,
                        false,
                    ));
                }
            }

            // Compute the node hashes in parallel
            iterate_mut!(nodes).all(MerkleTree::generate_hash);
            // Collect the next set of leaves for the computation
            leaves.clear();

            while !nodes.is_empty() {
                let node = nodes.pop_front().unwrap();
                leaves.push_back(Box::new(node));
            }

            // trace!("---------------------");
        }

        Some(Box::new(MerkleTree {
            root: leaves.pop_front().unwrap(),
        }))
    }

    pub fn compute_combined_hash(
        left_hash: Option<[u8; 32]>,
        right_hash: Option<[u8; 32]>,
    ) -> [u8; 32] {
        let mut vbytes: Vec<u8> = vec![];
        vbytes.extend(left_hash.unwrap());
        vbytes.extend(right_hash.unwrap());
        hash(&vbytes)
    }
    pub fn traverse(&self, mode: TraverseMode, read_func: impl Fn(&MerkleTreeNode)) {
        MerkleTree::traverse_node(&mode, &self.root, &read_func);
    }

    pub fn create_clone(&self) -> Box<MerkleTree> {
        Box::new(MerkleTree {
            root: MerkleTree::clone_node(Some(&self.root)).unwrap(),
        })
    }

    pub fn prune(&mut self, prune_func: impl Fn(usize) -> bool) {
        MerkleTree::prune_node(Some(&mut self.root), &prune_func);
    }

    pub fn calculate_child_count(
        left: &Option<Box<MerkleTreeNode>>,
        right: &Option<Box<MerkleTreeNode>>,
    ) -> usize {
        let mut count = 1 as usize;

        if left.is_some() {
            count += left.as_ref().unwrap().count;
        }

        if right.is_some() {
            count += right.as_ref().unwrap().count;
        }

        count
    }

    fn generate_hash(node: &mut MerkleTreeNode) -> bool {
        if node.hash.is_some() {
            return true;
        }

        match &node.node_type {
            NodeType::Node { left, right } => {
                let mut vbytes: Vec<u8> = vec![];
                vbytes.extend(left.as_ref().unwrap().hash.unwrap());
                vbytes.extend(right.as_ref().unwrap().hash.unwrap());

                // dbg!(hash(&vbytes));
                node.hash = Some(hash(&vbytes));
                // trace!(
                //     "Node : buffer = {:?}, hash = {:?}",
                //     hex::encode(vbytes),
                //     hex::encode(node.hash.unwrap())
                // );
            }
            NodeType::Transaction { .. } => {}
        }

        return true;
    }

    fn traverse_node(
        mode: &TraverseMode,
        node: &MerkleTreeNode,
        read_func: &impl Fn(&MerkleTreeNode),
    ) {
        if *mode == TraverseMode::BreadthFirst {
            read_func(node);
        }

        match &node.node_type {
            NodeType::Node { left, right } => {
                if left.is_some() {
                    MerkleTree::traverse_node(mode, left.as_ref().unwrap(), read_func);
                }

                if right.is_some() {
                    MerkleTree::traverse_node(mode, right.as_ref().unwrap(), read_func);
                }
            }
            NodeType::Transaction { .. } => {}
        }

        if *mode == TraverseMode::DepthFist {
            read_func(node);
        }
    }

    fn clone_node(node: Option<&Box<MerkleTreeNode>>) -> Option<Box<MerkleTreeNode>> {
        if node.is_some() {
            Some(Box::new(MerkleTreeNode::new(
                match &node.unwrap().node_type {
                    NodeType::Node { left, right } => NodeType::Node {
                        left: MerkleTree::clone_node(left.as_ref()),
                        right: MerkleTree::clone_node(right.as_ref()),
                    },
                    NodeType::Transaction { index } => NodeType::Transaction { index: *index },
                },
                node.as_ref().unwrap().hash,
                node.as_ref().unwrap().count,
                node.as_ref().unwrap().is_spv,
            )))
        } else {
            None
        }
    }

    fn prune_node(
        node: Option<&mut Box<MerkleTreeNode>>,
        prune_func: &impl Fn(usize) -> bool,
    ) -> bool {
        return if node.is_some() {
            let node = node.unwrap();
            match &mut node.node_type {
                NodeType::Node { left, right } => {
                    let mut prune = MerkleTree::prune_node(left.as_mut(), prune_func);
                    prune &= MerkleTree::prune_node(right.as_mut(), prune_func);

                    if prune {
                        node.node_type = NodeType::Node {
                            left: None,
                            right: None,
                        };
                        node.count = 1;
                    } else {
                        node.count = MerkleTree::calculate_child_count(&left, &right);
                    }

                    prune
                }
                NodeType::Transaction { index } => prune_func(*index),
            }
        } else {
            true
        };
    }
    // Generates a Merkle proof for the given transaction hash.
}

#[cfg(test)]
mod tests {
    use crate::core::consensus::merkle::MerkleTree;
    use crate::core::consensus::transaction::{Transaction, TransactionType};
    use crate::core::consensus::wallet::Wallet;
    use crate::core::util::crypto::generate_keys;

    #[test]
    fn merkle_tree_generation_test() {
        let keys = generate_keys();
        let wallet = Wallet::new(keys.1, keys.0);

        let mut transactions = vec![];
        for i in 0..5 {
            let mut transaction = Transaction::default();
            transaction.timestamp = i;
            transaction.sign(&wallet.private_key);
            transactions.push(transaction);
        }

        let tree1 = MerkleTree::generate(&transactions).unwrap();
        transactions[0].timestamp = 10;
        transactions[0].sign(&wallet.private_key);
        let tree2 = MerkleTree::generate(&transactions).unwrap();
        transactions[4].timestamp = 11;
        transactions[4].sign(&wallet.private_key);
        let tree3 = MerkleTree::generate(&transactions).unwrap();

        transactions[2].timestamp = 12;
        transactions[2].sign(&wallet.private_key);
        let tree4 = MerkleTree::generate(&transactions).unwrap();
        let tree5 = MerkleTree::generate(&transactions).unwrap();

        dbg!(tree1.get_root_hash(), tree2.get_root_hash());
        assert_ne!(tree1.get_root_hash(), tree2.get_root_hash());
        assert_ne!(tree2.get_root_hash(), tree3.get_root_hash());
        assert_ne!(tree3.get_root_hash(), tree4.get_root_hash());
        assert_eq!(tree4.get_root_hash(), tree5.get_root_hash());
    }

    #[test]
    fn test_generate_odd_number_of_transactions() {
        let keys = generate_keys();
        let wallet = Wallet::new(keys.1, keys.0);

        let mut transactions = Vec::new();
        for i in 0..3 {
            // Use 3 for an odd number of transactions
            let mut transaction = Transaction::default();
            transaction.timestamp = i;
            transaction.sign(&wallet.private_key);
            transactions.push(transaction);
        }

        // Generate the Merkle tree from the transactions.
        let tree = MerkleTree::generate(&transactions).unwrap();

        let root_hash = tree.get_root_hash();

        assert_ne!(root_hash, [0u8; 32], "Root hash should not be all zeros.");

        let mut altered_transactions = transactions.clone();
        altered_transactions[0].timestamp += 1;
        altered_transactions[0].sign(&wallet.private_key);
        let altered_tree = MerkleTree::generate(&altered_transactions).unwrap();
        let altered_root_hash = altered_tree.get_root_hash();
        assert_ne!(
            root_hash, altered_root_hash,
            "Root hash should change when a transaction is altered."
        );
    }

    #[test]
    fn merkle_tree_pruning_test() {
        let keys = generate_keys();
        let wallet = Wallet::new(keys.1, keys.0);

        let mut transactions = vec![];

        for i in 0..5 {
            let mut transaction = Transaction::default();
            transaction.timestamp = i;
            transaction.sign(&wallet.private_key);
            transactions.push(transaction);
        }

        let target_hash = transactions[0].hash_for_signature.unwrap();

        let tree = MerkleTree::generate(&transactions).unwrap();
        let cloned_tree = tree.create_clone();
        let mut pruned_tree = tree.create_clone();
        pruned_tree.prune(|index| target_hash != transactions[index].hash_for_signature.unwrap());

        assert_eq!(tree.get_root_hash(), cloned_tree.get_root_hash());
        assert_eq!(cloned_tree.get_root_hash(), pruned_tree.get_root_hash());
        assert_eq!(tree.len(), 11);
        assert_eq!(cloned_tree.len(), tree.len());
        assert_eq!(pruned_tree.len(), 7);
    }

    #[test]
    fn test_generate_with_spv_transactions() {
        let keys = generate_keys();
        let wallet = Wallet::new(keys.1, keys.0);

        // Create 5 normal transactions and sign them
        let mut transactions = Vec::new();
        for _ in 0..5 {
            let mut tx = Transaction::default();
            tx.sign(&wallet.private_key);
            // dbg!(&tx);
            transactions.push(tx);
        }

        // Generate the Merkle tree from the original transactions
        let merkle_tree_original = MerkleTree::generate(&transactions).unwrap();
        let root_original = merkle_tree_original.get_root_hash();

        // Replace second transaction with an SPV transaction (b becomes b(SPV))
        let mut transactions_with_spv_b = transactions.clone();
        transactions_with_spv_b[1] = create_spv_transaction(&wallet, transactions[1].clone(), 1);
        let merkle_tree_spv_b = MerkleTree::generate(&transactions_with_spv_b).unwrap();
        assert_eq!(
            root_original,
            merkle_tree_spv_b.get_root_hash(),
            "Merkle roots should be equal after replacing b with b(SPV)."
        );

        //  Replace all transactions with SPV transactions
        let transactions_all_spv = transactions
            .iter()
            .map(|tx| create_spv_transaction(&wallet, tx.clone(), 1))
            .collect::<Vec<Transaction>>();
        let merkle_tree_all_spv = MerkleTree::generate(&transactions_all_spv).unwrap();
        assert_eq!(
            root_original,
            merkle_tree_all_spv.get_root_hash(),
            "Merkle roots should be equal after replacing all with SPV transactions."
        );

        //  Combine c and d into a single SPV transaction (cd becomes cd(SPV))
        // and combine their hashes
        let mut transactions_cd_spv = transactions.clone();
        let combined_tx3_tx4: Transaction =
            combine_transactions_into_spv(transactions[2].clone(), transactions[3].clone());

        dbg!(&combined_tx3_tx4);
        transactions_cd_spv.splice(2..4, std::iter::once(combined_tx3_tx4));
        let merkle_tree_cd_spv = MerkleTree::generate(&transactions_cd_spv).unwrap();
        assert_eq!(
            root_original,
            merkle_tree_cd_spv.get_root_hash(),
            "Merkle roots should be equal after replacing cd with combined cd(SPV)."
        );

        // Various SPV transactions (b and cd are SPV, e is SPV)
        let mut transactions_mixed_spv = transactions.clone();
        transactions_mixed_spv[1] = create_spv_transaction(&wallet, transactions[1].clone(), 1);
        transactions_mixed_spv.splice(
            2..4,
            std::iter::once(combine_transactions_into_spv(
                transactions[2].clone(),
                transactions[3].clone(),
            )),
        );
        transactions_mixed_spv[3] = create_spv_transaction(&wallet, transactions[4].clone(), 1);
        let merkle_tree_mixed_spv = MerkleTree::generate(&transactions_mixed_spv).unwrap();
        assert_eq!(
            root_original,
            merkle_tree_mixed_spv.get_root_hash(),
            "Merkle roots should be equal after various SPV replacements."
        );

        // Break it by changing txs_replacements value somewhere
        let mut transactions_broken_spv = transactions_mixed_spv.clone();
        transactions_broken_spv[1].txs_replacements = 3;
        let merkle_tree_broken_spv = MerkleTree::generate(&transactions_broken_spv).unwrap();
        assert_ne!(
            root_original,
            merkle_tree_broken_spv.get_root_hash(),
            "Merkle root should differ due to changed SPV tx replacements."
        );
    }

    fn create_spv_transaction(
        wallet: &Wallet,
        mut tx: Transaction,
        txs_replacements: u32,
    ) -> Transaction {
        tx.sign(&wallet.private_key);
        Transaction {
            timestamp: tx.timestamp,
            from: tx.from,
            to: tx.to,
            data: tx.data,
            transaction_type: TransactionType::SPV,
            txs_replacements, // Set the number of transactions this SPV transaction represents
            signature: tx.signature,
            path: tx.path,
            hash_for_signature: tx.hash_for_signature,
            total_in: tx.total_in,
            total_out: tx.total_out,
            total_fees: tx.total_fees,
            total_work_for_me: tx.total_work_for_me,
            cumulative_fees: tx.cumulative_fees,
        }
    }
    fn combine_transactions_into_spv(mut tx1: Transaction, tx2: Transaction) -> Transaction {
        let combined_hash =
            MerkleTree::compute_combined_hash(tx1.hash_for_signature, tx2.hash_for_signature);

        dbg!(combined_hash);
        tx1.hash_for_signature = tx2.hash_for_signature;
        tx1.transaction_type = TransactionType::SPV;
        tx1.txs_replacements = 2;
        tx1
        // spv_tx.transaction_type = TransactionType::SPV;
        // spv_tx.txs_replacements = 1; // Represents the combination of two transactions
        // spv_tx.hash_for_signature = Some(combined_hash);
        // // dbg!(&spv_tx);
        // spv_tx
    }
}
